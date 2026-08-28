import { useCallback, useEffect, useRef, useState } from "react";

import type { ComandoVenta, PrevisualizacionVenta, VentaConfirmada } from "@nexosoft/app";
import {
  Cantidad,
  CondicionIva,
  ErrorDominio,
  EstadoCae,
  etiquetaCondicionIva,
  FormaDePago,
  Money,
  resolverTipoComprobante,
  TipoComprobante,
} from "@nexosoft/domain";
import type { DatosTicket } from "@nexosoft/hardware";
import type { IntentoPago } from "@nexosoft/pagos";

import type { EntornoPos, ProductoCatalogo } from "../datos/bootstrap";
import { estaEnTauri } from "../datos/ejecutor-sql-tauri";
import { ErrorImpresoraVirtual } from "../datos/impresora-escpos";
import { etiquetaComprobante, pesos } from "../formato";
import { construirOperacionVenta, mapearMedioPago, resumenMedioPago } from "../sync/mapeo";
import type { EstadoSync } from "../sync/useSync";
import type { ClienteMediosPago, Tarjeta } from "../sync/cliente-medios-pago";
import { AsistenteCobro } from "./AsistenteCobro";
import {
  moverCursor,
  montoBaseParaSaldoExacto,
  pasoTrasElegirMedio,
  pasoTrasElegirTarjeta,
  superaSaldoSinVuelto,
  volverPasoAtras,
  type PasoAsistente,
} from "./asistente-cobro-helpers";
import { ComprobanteA4 } from "./ComprobanteA4";
import { ComprobanteTicket } from "./ComprobanteTicket";
import {
  buscarProductoPorCodigo,
  cambiarCantidadCarrito,
  filtrarCatalogoVenta,
  fijarCantidadCarrito,
  quitarDelCarrito,
  ultimoItemCarrito,
  type ItemCarrito,
} from "./pos-helpers";
import {
  descuentoDeLinea,
  descuentoPorcentajeLinea,
  PROMOS_DEMO,
  promoAplicable,
} from "./promos";
import { useImpresionA4 } from "./usar-impresion-a4";
import { useImpresionTicket } from "./usar-impresion-ticket";
import { useLectorTeclado } from "./usar-lector-teclado";

export interface PagoUi {
  readonly forma: FormaDePago;
  readonly monto: Money;
  /** Trazabilidad de tarjeta configurada (Fase 12.E). */
  readonly tarjetaConfigId?: string;
  readonly cuotas?: number;
  /** Recargo de esta tarjeta ya incluido en `monto`. */
  readonly recargoAplicado?: Money;
}

const RECEPTORES: ReadonlyArray<{ valor: CondicionIva; etiqueta: string }> = [
  { valor: CondicionIva.ConsumidorFinal, etiqueta: "Consumidor Final" },
  { valor: CondicionIva.ResponsableInscripto, etiqueta: "Responsable Inscripto" },
  { valor: CondicionIva.Monotributo, etiqueta: "Monotributo" },
];
const FORMAS: ReadonlyArray<{ valor: FormaDePago; etiqueta: string; electronico?: boolean }> = [
  { valor: FormaDePago.Efectivo, etiqueta: "Efectivo" },
  { valor: FormaDePago.Tarjeta, etiqueta: "Tarjeta / Point", electronico: true },
  { valor: FormaDePago.Billetera, etiqueta: "Billetera (QR)", electronico: true },
  { valor: FormaDePago.Transferencia, etiqueta: "Transferencia" },
  { valor: FormaDePago.CuentaCorriente, etiqueta: "Cuenta corriente" },
];

/** Cliente elegible para vender en cuenta corriente (fiado). */
export interface ClienteVenta {
  readonly id: string;
  readonly nombre: string;
}

function mensajeError(e: unknown): string {
  if (e instanceof ErrorDominio) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}

/** Promoción vigente que aplica a un ítem del carrito (o `undefined`). */
function promoDeItem(c: ItemCarrito) {
  return promoAplicable(
    PROMOS_DEMO,
    c.producto.articulo.id,
    c.producto.articulo.rubroId,
    new Date(),
  );
}

function armarComando(
  carrito: readonly ItemCarrito[],
  condicionReceptor: CondicionIva,
  pagos: readonly PagoUi[],
  recargoPorcentaje = 0,
  clienteId?: string,
): ComandoVenta {
  return {
    items: carrito.map((c) => {
      const promo = promoDeItem(c);
      const pct = promo
        ? descuentoPorcentajeLinea(promo, c.cantidad, c.producto.precioFinal)
        : 0;
      return {
        articuloId: c.producto.articulo.id,
        cantidad: Cantidad.de(String(c.cantidad)),
        ...(pct > 0 ? { descuentoPorcentaje: pct } : {}),
      };
    }),
    condicionReceptor,
    pagos: pagos.map((p) => ({
      forma: p.forma,
      monto: p.monto,
      ...(p.tarjetaConfigId !== undefined ? { tarjetaConfigId: p.tarjetaConfigId } : {}),
      ...(p.cuotas !== undefined ? { cuotas: p.cuotas } : {}),
      ...(p.recargoAplicado !== undefined ? { recargoAplicado: p.recargoAplicado } : {}),
    })),
    ...(recargoPorcentaje > 0 ? { recargoPorcentaje } : {}),
    ...(clienteId !== undefined ? { clienteId } : {}),
  };
}

export function PantallaPos({
  entorno,
  sync,
  clientes = [],
  clienteMediosPago,
}: {
  entorno: EntornoPos;
  /** Estado de la cola de sincronización (lo orquesta el shell con `useSync`). */
  sync: EstadoSync;
  /** Clientes para vender en cuenta corriente (fiado). Vacío = sin selector. */
  clientes?: readonly ClienteVenta[];
  /** Tarjetas configuradas (Fase 12.E), para auto-aplicar su recargo al cobrar. */
  clienteMediosPago?: ClienteMediosPago;
}) {
  const { servicio, config, catalogo, impresora, lector, pasarela, grillaRapida } = entorno;

  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [condicionReceptor, setCondicionReceptor] = useState<CondicionIva>(
    CondicionIva.ConsumidorFinal,
  );
  const [clienteId, setClienteId] = useState<string>("");
  const [pagos, setPagos] = useState<PagoUi[]>([]);
  const [recargoPorc, setRecargoPorc] = useState<number>(0);
  const [preview, setPreview] = useState<PrevisualizacionVenta | null>(null);
  const [ultimaVenta, setUltimaVenta] = useState<VentaConfirmada | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formaPago, setFormaPago] = useState<FormaDePago>(FormaDePago.Efectivo);
  const [montoPago, setMontoPago] = useState<string>("");
  const [tarjetas, setTarjetas] = useState<Tarjeta[]>([]);
  const [tarjetaSeleccionada, setTarjetaSeleccionada] = useState<string>("");
  const [cuotasSeleccionadas, setCuotasSeleccionadas] = useState<string>("");
  const [imprimiendo, setImprimiendo] = useState(false);
  const [pagoElectronico, setPagoElectronico] = useState<IntentoPago | null>(null);
  const [cobroRapidoPendiente, setCobroRapidoPendiente] = useState(false);
  const [pasoAsistente, setPasoAsistente] = useState<PasoAsistente>("cerrado");
  const [cursorAsistente, setCursorAsistente] = useState(0);
  const [avanceAsistentePendiente, setAvanceAsistentePendiente] = useState(false);
  /** Camino recorrido dentro del asistente, para que Esc vuelva un paso atrás. */
  const [historialAsistente, setHistorialAsistente] = useState<PasoAsistente[]>([]);
  /**
   * Venta ya confirmada desde el asistente, esperando el paso "¿imprimir?".
   * Se guarda con los pagos de ESA venta porque `pagos` se limpia al
   * confirmar y el ticket los necesita para el detalle de formas de pago.
   */
  const [ventaAsistente, setVentaAsistente] = useState<{
    venta: VentaConfirmada;
    pagos: PagoUi[];
  } | null>(null);
  // Fase 17: `catalogo` es una foto tomada al bootstrapear (no se re-lee
  // sola), así que la estrella de "grilla rápida" se refleja acá al toque
  // (optimista) además de guardarse en el local `entorno.grillaRapida`.
  const [estrellaOverride, setEstrellaOverride] = useState<Record<string, boolean>>({});
  /**
   * Producto resaltado dentro de los resultados de búsqueda. El cajero baja
   * con las flechas y confirma con Enter sin soltar el teclado ni tocar el
   * mouse, igual que el resto de la pantalla (Fase 15).
   */
  const [cursorBusqueda, setCursorBusqueda] = useState(0);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const buscadorRef = useRef<HTMLInputElement>(null);
  const montoAsistenteRef = useRef<HTMLInputElement>(null);
  /** Resultado resaltado, para mantenerlo visible al bajar con las flechas. */
  const itemBusquedaRef = useRef<HTMLDivElement>(null);
  /**
   * Marca temporal del evento que abrió el asistente. React 18 aplica el
   * `setState` de un evento de teclado en forma SÍNCRONA (los eventos de
   * teclado son "discretos"), así que el listener global del asistente queda
   * enganchado mientras ese mismo Enter físico todavía está burbujeando hacia
   * `window` — y el asistente se comía el primer paso solo, saltando de
   * "Seleccionar Medio" directo a "Confirmar Monto" con Efectivo elegido.
   * Comparando contra el `timeStamp` del evento (mismo origen de tiempo que
   * `performance.now()`) se descarta ese Enter ya consumido.
   */
  const aperturaAsistenteRef = useRef(0);
  /**
   * Espejo de `pasoAsistente` para leerlo desde handlers cuyo closure quedó
   * con el valor del render anterior — en particular el `onBlur` del
   * buscador, que se dispara DURANTE `abrirAsistente()`, cuando el estado
   * todavía dice "cerrado" y por lo tanto re-enfocaba el buscador anulando
   * el `blur()`. Con el foco de vuelta ahí, el buscador seguía manejando
   * cada Enter y el asistente quedaba trabado en el primer paso.
   */
  const pasoAsistenteRef = useRef<PasoAsistente>("cerrado");
  const { datosA4, imprimirA4 } = useImpresionA4();
  const { datosTicket, imprimirTicketPreview } = useImpresionTicket();

  // ----- Foco del buscador (Fase 15: operación 100% lector + teclado) -----
  // El buscador vive con el foco casi todo el tiempo, así el lector de barras
  // (que tipea como teclado) escribe directo ahí y Enter agrega por código
  // exacto. Después de cada acción de "volver a escanear" (agregar, cambiar
  // cantidad, sacar un ítem, cerrar una venta) el foco vuelve solo. NO se
  // fuerza el foco después de acciones de cobro (agregar pago, etc.): ahí el
  // cajero está trabajando activamente en otro campo y forzar el foco se lo
  // pisaría.
  function refocarBuscador() {
    buscadorRef.current?.focus();
  }
  useEffect(() => {
    refocarBuscador();
  }, []);

  // ----- Lector de barras -----
  const buscarPorCodigo = useCallback(
    (codigo: string) => {
      const prod = buscarProductoPorCodigo(catalogo, codigo);
      if (prod) agregar(prod);
      else setError(`Código de barras no encontrado: ${codigo}`);
    },
    // agregar se define más abajo, pero es estable porque usa setCarrito funcional
    [catalogo],
  );
  useLectorTeclado(lector, buscarPorCodigo, pasoAsistente === "cerrado");

  // ----- Tarjetas configuradas (Fase 12.E) -----
  useEffect(() => {
    if (!clienteMediosPago) return;
    let vivo = true;
    clienteMediosPago
      .listar(false)
      .then((ts) => {
        if (vivo) setTarjetas(ts);
      })
      .catch(() => {
        // Sin tarjetas configuradas o sin conexión: el cobro manual sigue andando.
      });
    return () => {
      vivo = false;
    };
  }, [clienteMediosPago]);

  const tarjetaActual = tarjetas.find((t) => t.id === tarjetaSeleccionada);
  const tasaActual = tarjetaActual?.tasas.find((t) => t.cantidadCuotas === Number(cuotasSeleccionadas));

  useEffect(() => {
    if (carrito.length === 0) {
      setPreview(null);
      return;
    }
    let vivo = true;
    servicio
      .previsualizarVenta(armarComando(carrito, condicionReceptor, pagos, recargoPorc))
      .then((p) => {
        if (vivo) {
          setPreview(p);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (vivo) {
          setPreview(null);
          setError(mensajeError(e));
        }
      });
    return () => {
      vivo = false;
    };
  }, [carrito, condicionReceptor, pagos, recargoPorc, servicio]);

  // Fase 10.1: sin alta en ARCA, la preview muestra el ticket sin fiscal —
  // el receptor no influye (no se resuelve A/B/C).
  const emiteFiscal = config.emiteComprobantesFiscales !== false;
  const tipo = emiteFiscal
    ? resolverTipoComprobante(config.condicionIvaEmisor, condicionReceptor)
    : TipoComprobante.TicketNoFiscal;

  /** `true` si el producto está marcado para la grilla rápida (Fase 17). */
  function esGrillaRapida(producto: ProductoCatalogo): boolean {
    const id = producto.articulo.id;
    return estrellaOverride[id] ?? producto.articulo.mostrarEnGrillaRapida ?? false;
  }

  /** Toggle local (estrella ★/☆): no sincroniza, vive en el SQLite de la terminal. */
  function alternarGrillaRapida(producto: ProductoCatalogo) {
    const id = producto.articulo.id;
    const nuevoValor = !esGrillaRapida(producto);
    setEstrellaOverride((prev) => ({ ...prev, [id]: nuevoValor }));
    void grillaRapida.establecer(id, nuevoValor);
  }

  function agregar(producto: ProductoCatalogo) {
    setError(null);
    setCarrito((prev) => {
      const actual = prev.find((c) => c.producto.articulo.id === producto.articulo.id);
      if (actual) {
        return prev.map((c) => (c === actual ? { ...c, cantidad: c.cantidad + 1 } : c));
      }
      return [...prev, { producto, cantidad: 1 }];
    });
    refocarBuscador();
  }

  function cambiarCantidad(id: string, delta: number) {
    setCarrito((prev) => cambiarCantidadCarrito(prev, id, delta));
    refocarBuscador();
  }

  function fijarCantidad(id: string, cantidad: number) {
    setCarrito((prev) => fijarCantidadCarrito(prev, id, cantidad));
    refocarBuscador();
  }

  function quitar(id: string) {
    setCarrito((prev) => quitarDelCarrito(prev, id));
    refocarBuscador();
  }

  /** Atajo F8: cambia la cantidad del último ítem agregado a un valor exacto. */
  function cambiarCantidadUltimoItem() {
    const ultimo = ultimoItemCarrito(carrito);
    if (!ultimo) return;
    const respuesta = window.prompt(
      `Nueva cantidad para "${ultimo.producto.articulo.descripcion}":`,
      String(ultimo.cantidad),
    );
    if (respuesta === null) return; // canceló
    const cantidad = Number(respuesta.trim().replace(",", "."));
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      setError("Cantidad inválida.");
      return;
    }
    fijarCantidad(ultimo.producto.articulo.id, cantidad);
  }

  /** Atajo Supr: saca del carrito el último ítem agregado. */
  function quitarUltimoItem() {
    const ultimo = ultimoItemCarrito(carrito);
    if (ultimo) quitar(ultimo.producto.articulo.id);
  }

  /**
   * Atajo F12 ("cobro rápido"): cobra el saldo pendiente exacto en efectivo y
   * confirma la venta en un solo paso — para cuando el cliente da la plata
   * justa. Si ya está cubierta (saldo cero), confirma directo. No imprime
   * solo: el ticket queda listo en el overlay de "Imprimir" (hoy la térmica
   * es un mock, no hay hardware real conectado — ver `packages/hardware`).
   */
  function cobroRapido() {
    if (!preview || carrito.length === 0) return;
    if (preview.cobro.cancelada) {
      void confirmar();
      return;
    }
    if (formaPago !== FormaDePago.Efectivo) {
      setError("El cobro rápido (F12) es para efectivo. Elegí Efectivo o agregá el pago a mano.");
      return;
    }
    pagoExacto();
    setCobroRapidoPendiente(true);
  }

  // Completa el cobro rápido apenas el preview confirma que ya está cancelada
  // (el pago recién agregado por pagoExacto() se refleja async, vía el
  // useEffect de arriba que recalcula `preview`).
  useEffect(() => {
    if (cobroRapidoPendiente && preview?.cobro.cancelada) {
      setCobroRapidoPendiente(false);
      void confirmar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cobroRapidoPendiente, preview]);

  function agregarPago() {
    try {
      const montoBase = Money.desde(montoPago.replace(",", "."));
      if (!montoBase.esPositivo()) {
        setError("El monto del pago debe ser mayor a cero.");
        return;
      }
      setPagos((prev) => [...prev, armarPagoUi(montoBase)]);
      setMontoPago("");
      setTarjetaSeleccionada("");
      setCuotasSeleccionadas("");
      setError(null);
    } catch {
      setError("Monto de pago inválido.");
    }
  }

  /**
   * Abre el asistente de cobro (Fase 16: wizard "Seleccionar Medio" con
   * flechas + Enter) en el primer paso. Le saca el foco al buscador para que
   * el listener global de teclado del wizard no compita con su `onKeyDown`.
   */
  function abrirAsistente(marcaDeTiempo = performance.now()) {
    if (pasoAsistenteRef.current !== "cerrado") return;
    aperturaAsistenteRef.current = marcaDeTiempo;
    // Si los pagos ya cubren el total (por ejemplo se cerró el asistente con
    // Esc y se retoma), no tiene sentido volver a pedir medio de pago.
    const inicial: PasoAsistente = preview?.cobro.cancelada ? "resumen" : "medio";
    // El ref se actualiza ANTES del blur: el `onBlur` del buscador lo lee
    // para no re-enfocarse y devolverle el foco (ver `pasoAsistenteRef`).
    pasoAsistenteRef.current = inicial;
    setPasoAsistente(inicial);
    setCursorAsistente(0);
    setHistorialAsistente([]);
    buscadorRef.current?.blur();
  }

  /** Cierra el asistente sin tocar los pagos ya agregados (se sacan con la × de siempre). */
  function cerrarAsistente() {
    pasoAsistenteRef.current = "cerrado";
    setPasoAsistente("cerrado");
    setHistorialAsistente([]);
    setVentaAsistente(null);
    refocarBuscador();
  }

  /** Avanza a `siguiente` recordando el paso actual, para que Esc pueda volver. */
  function avanzarPaso(siguiente: PasoAsistente) {
    setHistorialAsistente((prev) => [...prev, pasoAsistente]);
    pasoAsistenteRef.current = siguiente;
    setPasoAsistente(siguiente);
    setCursorAsistente(0);
  }

  function elegirMedioAsistente(indice: number) {
    const forma = FORMAS[indice]?.valor;
    if (!forma || !preview) return;
    setFormaPago(forma);
    setTarjetaSeleccionada("");
    setCuotasSeleccionadas("");
    setError(null);
    const siguiente = pasoTrasElegirMedio(forma, tarjetas.length, clientes.length, clienteId !== "");
    if (siguiente === "monto") {
      setMontoPago(preview.cobro.saldoPendiente.aDecimalString(2));
    }
    avanzarPaso(siguiente);
  }

  function elegirTarjetaAsistente(indice: number) {
    const tarjeta = tarjetas[indice];
    if (!tarjeta || !preview) return;
    setTarjetaSeleccionada(tarjeta.id);
    setCuotasSeleccionadas("");
    const siguiente = pasoTrasElegirTarjeta(tarjeta.tasas.length);
    if (siguiente === "monto") {
      setMontoPago(preview.cobro.saldoPendiente.aDecimalString(2));
    }
    avanzarPaso(siguiente);
  }

  function elegirCuotasAsistente(indice: number) {
    const tasa = tarjetaActual?.tasas[indice];
    if (!tasa || !preview) return;
    setCuotasSeleccionadas(String(tasa.cantidadCuotas));
    setMontoPago(
      montoBaseParaSaldoExacto(preview.cobro.saldoPendiente, tasa.recargoPorcentaje).aDecimalString(2),
    );
    avanzarPaso("monto");
  }

  function elegirClienteAsistente(indice: number) {
    const cliente = clientes[indice];
    if (!cliente || !preview) return;
    setClienteId(cliente.id);
    setMontoPago(preview.cobro.saldoPendiente.aDecimalString(2));
    avanzarPaso("monto");
  }

  /** Confirma el paso "monto" del asistente: valida contra el saldo y agrega el pago. */
  function confirmarMontoAsistente() {
    if (!preview) return;
    try {
      const montoBase = Money.desde(montoPago.replace(",", "."));
      if (!montoBase.esPositivo()) {
        setError("El monto del pago debe ser mayor a cero.");
        return;
      }
      const pagoUi = armarPagoUi(montoBase);
      if (superaSaldoSinVuelto(formaPago, pagoUi.monto, preview.cobro.saldoPendiente)) {
        const etiquetaForma = FORMAS.find((f) => f.valor === formaPago)?.etiqueta ?? formaPago;
        setError(`No se puede dar vuelto con ${etiquetaForma}: el monto no puede superar el saldo pendiente.`);
        return;
      }
      agregarPago();
      setAvanceAsistentePendiente(true);
    } catch {
      setError("Monto de pago inválido.");
    }
  }

  // Avanza el asistente tras agregar un pago (paso "monto" → Enter). La
  // validación del cobro es async (recalcula `preview` vía el useEffect de
  // arriba), así que este effect espera a que `preview.cobro.pagado`
  // refleje el pago recién agregado antes de decidir el próximo paso —
  // mismo patrón que `cobroRapidoPendiente` más arriba.
  useEffect(() => {
    if (!avanceAsistentePendiente) return;
    if (error) {
      setAvanceAsistentePendiente(false);
      return;
    }
    if (!preview) return;
    const totalPagosActual = pagos.reduce((acc, p) => acc.sumar(p.monto), Money.cero());
    if (!preview.cobro.pagado.igualA(totalPagosActual)) return;
    setAvanceAsistentePendiente(false);
    if (preview.cobro.cancelada) {
      // Cubierto el total: al resumen (muestra el vuelto y finaliza).
      setPasoAsistente("resumen");
      setCursorAsistente(0);
      setHistorialAsistente([]);
    } else {
      // Pago parcial (mixto): vuelve a pedir medio por el saldo restante.
      setPasoAsistente("medio");
      setCursorAsistente(0);
      setHistorialAsistente([]);
    }
  }, [avanceAsistentePendiente, preview, pagos, error]);

  // Navegación por teclado del asistente (flechas + Enter + Escape). Se
  // engancha solo mientras el wizard está abierto; el buscador pierde el
  // foco en `abrirAsistente()` para que su propio `onKeyDown` no compita.
  useEffect(() => {
    if (pasoAsistente === "cerrado") return;

    function onKeyDown(e: KeyboardEvent) {
      // Descarta el mismo Enter que abrió el asistente (ver
      // `aperturaAsistenteRef`): sin esto se comía el paso "Seleccionar
      // Medio" y saltaba directo a "Confirmar Monto" con Efectivo.
      if (e.timeStamp <= aperturaAsistenteRef.current) return;

      if (e.key === "Escape") {
        e.preventDefault();
        if (pasoAsistente === "imprimir") {
          // La venta YA está confirmada: Esc equivale a "no imprimir".
          cerrarAsistente();
        } else if (pasoAsistente === "resumen") {
          // Los pagos quedan cargados; se retoma con Enter desde el buscador.
          cerrarAsistente();
        } else {
          const atras = volverPasoAtras(historialAsistente);
          setHistorialAsistente(atras.historial);
          setCursorAsistente(0);
          if (atras.paso === "cerrado") cerrarAsistente();
          else setPasoAsistente(atras.paso);
        }
        return;
      }
      if (pasoAsistente === "medio") {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setCursorAsistente((c) => moverCursor(c, 1, FORMAS.length));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setCursorAsistente((c) => moverCursor(c, -1, FORMAS.length));
        } else if (e.key === "Enter") {
          e.preventDefault();
          elegirMedioAsistente(cursorAsistente);
        }
      } else if (pasoAsistente === "tarjeta") {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setCursorAsistente((c) => moverCursor(c, 1, tarjetas.length));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setCursorAsistente((c) => moverCursor(c, -1, tarjetas.length));
        } else if (e.key === "Enter") {
          e.preventDefault();
          elegirTarjetaAsistente(cursorAsistente);
        }
      } else if (pasoAsistente === "cuotas") {
        const longitud = tarjetaActual?.tasas.length ?? 0;
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setCursorAsistente((c) => moverCursor(c, 1, longitud));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setCursorAsistente((c) => moverCursor(c, -1, longitud));
        } else if (e.key === "Enter") {
          e.preventDefault();
          elegirCuotasAsistente(cursorAsistente);
        }
      } else if (pasoAsistente === "cliente") {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setCursorAsistente((c) => moverCursor(c, 1, clientes.length));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setCursorAsistente((c) => moverCursor(c, -1, clientes.length));
        } else if (e.key === "Enter") {
          e.preventDefault();
          elegirClienteAsistente(cursorAsistente);
        }
      } else if (pasoAsistente === "monto") {
        if (e.key === "Enter") {
          e.preventDefault();
          confirmarMontoAsistente();
        }
      } else if (pasoAsistente === "resumen") {
        if (e.key === "Enter") {
          e.preventDefault();
          void confirmar(true);
        }
      } else if (pasoAsistente === "imprimir") {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          setCursorAsistente((c) => moverCursor(c, 1, 2));
        } else if (e.key === "Enter") {
          e.preventDefault();
          void resolverImpresionAsistente(cursorAsistente === 0);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pasoAsistente,
    cursorAsistente,
    historialAsistente,
    tarjetas,
    tarjetaActual,
    clientes,
    clienteId,
    montoPago,
    preview,
    formaPago,
    ventaAsistente,
  ]);

  // Mantiene visible el resultado resaltado al moverse con las flechas.
  useEffect(() => {
    itemBusquedaRef.current?.scrollIntoView({ block: "nearest" });
  }, [cursorBusqueda, busquedaProducto]);

  // Red de seguridad del espejo: cubre las transiciones que no pasan por
  // `abrirAsistente`/`avanzarPaso`/`cerrarAsistente` (el avance tras un pago
  // y el salto a "imprimir" al confirmar la venta).
  useEffect(() => {
    pasoAsistenteRef.current = pasoAsistente;
  }, [pasoAsistente]);

  // Foco + selección automática del monto al entrar al paso "monto" (mismo
  // detalle que el simulador: el monto pre-cargado queda listo para
  // sobreescribir en un pago mixto).
  useEffect(() => {
    if (pasoAsistente === "monto") {
      montoAsistenteRef.current?.focus();
      montoAsistenteRef.current?.select();
    }
  }, [pasoAsistente]);

  /** Arma el `PagoUi`: si hay tarjeta+cuotas elegida, calcula y suma su recargo. */
  function armarPagoUi(montoBase: Money): PagoUi {
    if (tarjetaActual && tasaActual && tasaActual.recargoPorcentaje > 0) {
      const recargoAplicado = montoBase.porcentaje(tasaActual.recargoPorcentaje);
      return {
        forma: formaPago,
        monto: montoBase.sumar(recargoAplicado),
        tarjetaConfigId: tarjetaActual.id,
        cuotas: tasaActual.cantidadCuotas,
        recargoAplicado,
      };
    }
    return {
      forma: formaPago,
      monto: montoBase,
      ...(tarjetaActual ? { tarjetaConfigId: tarjetaActual.id, cuotas: Number(cuotasSeleccionadas) } : {}),
    };
  }

  function pagoExacto() {
    if (!preview) return;
    const saldo = preview.cobro.saldoPendiente;
    if (!saldo.esPositivo()) return;
    if (tarjetaActual && tasaActual && tasaActual.recargoPorcentaje > 0) {
      // saldo = base + base×tasa% → base = saldo / (1 + tasa/100)
      const base = saldo.dividirPor(1 + tasaActual.recargoPorcentaje / 100).redondear(2);
      const recargoAplicado = saldo.restar(base);
      setPagos((prev) => [
        ...prev,
        {
          forma: formaPago,
          monto: saldo,
          tarjetaConfigId: tarjetaActual.id,
          cuotas: tasaActual.cantidadCuotas,
          recargoAplicado,
        },
      ]);
    } else {
      setPagos((prev) => [...prev, { forma: formaPago, monto: saldo }]);
    }
  }

  function quitarPago(indice: number) {
    setPagos((prev) => prev.filter((_, i) => i !== indice));
  }

  /**
   * @param desdeAsistente Fase 17: si viene del asistente, la venta NO abre el
   *   panel de post-venta (CAE / A4 / anular) — el asistente sigue con su
   *   propio paso "¿imprimir ticket?" y deja la caja limpia para el próximo
   *   cliente. Esos comprobantes quedan accesibles desde el módulo
   *   Comprobantes para reimprimir, sacar A4 o anular.
   */
  async function confirmar(desdeAsistente = false) {
    if (carrito.length === 0) return;

    // Si hay un pago electrónico pendiente, iniciarlo antes de confirmar la venta
    const pagoElec = pagos.find((p) =>
      FORMAS.find((f) => f.valor === p.forma)?.electronico,
    );
    if (pagoElec && preview) {
      try {
        const intencionId = crypto.randomUUID();
        const medio = pagoElec.forma === FormaDePago.Billetera ? "qr" : "point" as const;
        const intento = await pasarela.iniciarPago({
          intencionPagoId: intencionId,
          monto: pagoElec.monto,
          medio,
          descripcion: `Venta ${config.razonSocial}`,
        });
        setPagoElectronico(intento);
        // Polling cada 2 s hasta resolución
        pollingRef.current = setInterval(async () => {
          try {
            const estado = await pasarela.consultarEstado(intencionId);
            setPagoElectronico(estado);
            if (estado.estado === "aprobado") {
              clearInterval(pollingRef.current!);
              pollingRef.current = null;
              setPagoElectronico(null);
              await _finalizarVenta(desdeAsistente);
            } else if (estado.estado === "rechazado" || estado.estado === "cancelado") {
              clearInterval(pollingRef.current!);
              pollingRef.current = null;
              setPagoElectronico(null);
              setError(`Pago ${estado.estado}: ${estado.motivoRechazo ?? ""}`);
            }
          } catch (e) {
            setError(mensajeError(e));
          }
        }, 2000);
        return;
      } catch (e) {
        setError(mensajeError(e));
        return;
      }
    }

    await _finalizarVenta(desdeAsistente);
  }

  async function _finalizarVenta(desdeAsistente = false) {
    // Fiado: si se paga con cuenta corriente, hace falta elegir el cliente.
    const hayCuentaCorriente = pagos.some((p) => p.forma === FormaDePago.CuentaCorriente);
    if (hayCuentaCorriente && clienteId === "") {
      setError("Elegí un cliente para vender en cuenta corriente.");
      return;
    }
    const clienteVenta = clienteId === "" ? undefined : clienteId;
    try {
      const venta = await servicio.confirmarVenta(
        armarComando(carrito, condicionReceptor, pagos, recargoPorc, clienteVenta),
      );
      if (desdeAsistente) {
        // Los pagos viajan con la venta: más abajo se limpia `pagos`, y el
        // ticket necesita el detalle de formas de pago de ESTA venta.
        setVentaAsistente({ venta, pagos: [...pagos] });
        setPasoAsistente("imprimir");
        setCursorAsistente(0);
        setHistorialAsistente([]);
      } else {
        setUltimaVenta(venta);
      }

      // Encolar la venta para sincronizar con el servidor de sucursal.
      // No rompe la venta (ya confirmada localmente) si el encolado falla.
      try {
        const itemsSync = carrito.map((c) => {
          const promo = promoDeItem(c);
          const desc = promo
            ? descuentoDeLinea(promo, c.cantidad, c.producto.precioFinal)
            : Money.cero();
          return {
            productoId: c.producto.articulo.id,
            cantidad: c.cantidad,
            precioUnitario: c.producto.precioFinal.aDecimalString(2),
            ...(desc.esPositivo() ? { descuento: desc.aDecimalString(2) } : {}),
            costoUnitario: c.producto.articulo.costoNeto.aDecimalString(2),
          };
        });
        // Pago combinado: viaja el desglose (un pago por medio) y el resumen.
        const pagosSync = pagos.map((p) => ({
          medioPago: mapearMedioPago(p.forma, tarjetas.find((t) => t.id === p.tarjetaConfigId)?.tipo),
          monto: p.monto.aDecimalString(2),
          ...(p.tarjetaConfigId !== undefined ? { tarjetaConfigId: p.tarjetaConfigId } : {}),
          ...(p.cuotas !== undefined ? { cuotas: p.cuotas } : {}),
          ...(p.recargoAplicado !== undefined ? { recargo: p.recargoAplicado.aDecimalString(2) } : {}),
        }));
        const medioPago = resumenMedioPago(
          pagosSync,
          mapearMedioPago(pagos[0]?.forma ?? FormaDePago.Efectivo),
        );
        await sync.encolar(
          construirOperacionVenta({
            items: itemsSync,
            medioPago,
            terminalId: entorno.sync.terminalId,
            pagos: pagosSync,
            recargo: venta.resultado.recargo.aDecimalString(2),
            tipoComprobante: venta.tipoComprobante,
            ...(clienteVenta !== undefined ? { clienteId: clienteVenta } : {}),
          }),
        );
      } catch (e) {
        console.error("No se pudo encolar la venta para sync:", e);
      }

      setCarrito([]);
      setPagos([]);
      setRecargoPorc(0);
      setClienteId("");
      setTarjetaSeleccionada("");
      setCuotasSeleccionadas("");
      setError(null);
      // Desde el asistente el foco NO vuelve al buscador todavía: falta el
      // paso "¿imprimir ticket?", que se maneja con el listener global.
      if (!desdeAsistente) refocarBuscador();
    } catch (e) {
      setError(mensajeError(e));
    }
  }

  async function cancelarPagoElectronico() {
    if (!pagoElectronico) return;
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    try {
      await pasarela.cancelar(pagoElectronico.intencionPagoId);
    } catch {
      // idempotente: ignorar
    }
    setPagoElectronico(null);
  }

  async function imprimirTicket(venta: VentaConfirmada, pagosDeLaVenta: readonly PagoUi[] = pagos) {
    if (imprimiendo) return;
    setImprimiendo(true);
    const datos = construirDatosTicket(venta, config, catalogo, pagosDeLaVenta, tarjetas);
    try {
      await impresora.imprimirTicket(datos);
      // En la app instalada la impresora es la térmica real (ESC/POS directo
      // al spooler): el ticket ya salió y abrir además el diálogo del
      // navegador lo imprimiría dos veces y frenaría la caja. La vista previa
      // queda solo para el navegador de desarrollo, donde no hay impresora.
      if (!estaEnTauri()) imprimirTicketPreview(datos);
    } catch (e) {
      if (e instanceof ErrorImpresoraVirtual) {
        // Esta caja no tiene térmica: el destino era una impresora virtual, que
        // habría guardado los comandos ESC/POS crudos en un archivo ilegible.
        // En vez de dejar al cliente sin nada, se abre la vista imprimible, que
        // sí sale bien por "Microsoft Print to PDF" — y además lleva el QR
        // fiscal, que el ESC/POS no imprime.
        //
        // No se muestra error: se abre un diálogo de impresión, que es señal
        // suficiente de que el ticket no salió solo por la térmica.
        imprimirTicketPreview(datos);
      } else {
        setError(`Error al imprimir: ${mensajeError(e)}`);
      }
    } finally {
      setImprimiendo(false);
    }
  }

  /**
   * Último paso del asistente: imprime (o no) el ticket de la venta recién
   * confirmada y deja la pantalla limpia para el próximo cliente.
   */
  async function resolverImpresionAsistente(imprimir: boolean) {
    const pendiente = ventaAsistente;
    cerrarAsistente();
    if (imprimir && pendiente) {
      await imprimirTicket(pendiente.venta, pendiente.pagos);
    }
  }

  async function autorizarCae() {
    if (!ultimaVenta) return;
    setError(null);
    try {
      const r = await entorno.facturacion.autorizar(ultimaVenta);
      setUltimaVenta(r);
      if (r.estadoCae !== EstadoCae.Autorizada) {
        setError("ARCA rechazó el comprobante.");
      }
    } catch (e) {
      setError(mensajeError(e));
    }
  }

  async function anularConNotaCredito() {
    if (!ultimaVenta) return;
    setError(null);
    try {
      const nc = await entorno.facturacion.emitirNotaCredito(ultimaVenta);
      setUltimaVenta(await entorno.facturacion.autorizar(nc));
    } catch (e) {
      setError(mensajeError(e));
    }
  }

  const puedeConfirmar = preview !== null && preview.cobro.cancelada;
  const catalogoFiltrado = filtrarCatalogoVenta(catalogo, busquedaProducto);
  const buscando = busquedaProducto.trim() !== "";
  const productosGrillaRapida = catalogo.filter((p) => esGrillaRapida(p));
  const recargoTarjetasTotal = pagos.reduce(
    (acc, p) => (p.recargoAplicado !== undefined ? acc.sumar(p.recargoAplicado) : acc),
    Money.cero(),
  );
  const montoBaseVivo = (() => {
    try {
      const m = Money.desde(montoPago.replace(",", "."));
      return m.esPositivo() ? m : null;
    } catch {
      return null;
    }
  })();
  const recargoVivo =
    montoBaseVivo && tasaActual && tasaActual.recargoPorcentaje > 0
      ? montoBaseVivo.porcentaje(tasaActual.recargoPorcentaje)
      : null;

  return (
    <div className="pos">
      <main className="cuerpo">
        <section className="venta">
          <input
            ref={buscadorRef}
            type="text"
            className="catalogo-buscador"
            placeholder="Escaneá un código o buscá por nombre…"
            value={busquedaProducto}
            onChange={(e) => {
              setBusquedaProducto(e.target.value);
              setCursorBusqueda(0); // resultados nuevos: arrancar desde arriba
            }}
            onBlur={(e) => {
              // El foco vive acá casi siempre (así el lector de barras, que
              // tipea como teclado, escribe directo). Si cae al fondo vacío
              // de la pantalla (relatedTarget null: no fue a otro control
              // real como un botón o un input), lo recuperamos. Si el
              // cajero clickeó a propósito otro campo, lo dejamos tranquilo.
              // Mientras el asistente de cobro está abierto tampoco se
              // recupera: `abrirAsistente()` le saca el foco a propósito
              // para que el buscador no compita con la navegación del wizard.
              if (e.relatedTarget === null && pasoAsistenteRef.current === "cerrado") {
                e.currentTarget.focus();
              }
            }}
            onKeyDown={(e) => {
              // Con el asistente abierto manda su listener global: si el
              // buscador siguiera actuando, cada Enter reabriría el wizard y
              // nunca avanzaría de paso.
              if (pasoAsistenteRef.current !== "cerrado") return;
              if (e.key === "Enter") {
                const codigo = busquedaProducto.trim();
                if (codigo === "") {
                  // Buscador vacío + Enter: dispara el cobro (Fase 16).
                  if (carrito.length === 0 || !preview) return;
                  abrirAsistente(e.timeStamp);
                  return;
                }
                // Código exacto (lector de barras) o, si no, el producto
                // resaltado en los resultados. En los dos casos se limpia la
                // búsqueda para quedar listo para el próximo ítem.
                const prod =
                  buscarProductoPorCodigo(catalogo, codigo) ?? catalogoFiltrado[cursorBusqueda];
                if (prod) {
                  agregar(prod);
                  setBusquedaProducto("");
                  setCursorBusqueda(0);
                }
                return;
              }
              // Flechas: mover el resaltado dentro de los resultados.
              if (buscando && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
                e.preventDefault();
                setCursorBusqueda((c) =>
                  moverCursor(c, e.key === "ArrowDown" ? 1 : -1, catalogoFiltrado.length),
                );
                return;
              }
              // Supr/F8/F12 no interfieren con la edición normal del texto de
              // búsqueda salvo Supr, que solo actúa con el campo vacío (si no,
              // "borrar" mientras se escribe un nombre eliminaría el carrito).
              if (e.key === "Delete" && busquedaProducto.trim() === "") {
                e.preventDefault();
                quitarUltimoItem();
              } else if (e.key === "F8") {
                e.preventDefault();
                cambiarCantidadUltimoItem();
              } else if (e.key === "F12") {
                e.preventDefault();
                cobroRapido();
              }
            }}
          />
          <div className="atajos-legend">
            <span>
              <kbd>Enter</kbd> (buscador vacío) cobra
            </span>
            <span>
              <kbd>Supr</kbd> saca el último ítem
            </span>
            <span>
              <kbd>F8</kbd> cambia su cantidad
            </span>
            <span>
              <kbd>F12</kbd> cobro exacto y confirma
            </span>
          </div>
          <div className="venta-cabecera">
            <div className="comprobante">
              <span className="tipo">{etiquetaComprobante(tipo)}</span>
              {emiteFiscal && (
                <select
                  value={condicionReceptor}
                  onChange={(e) => setCondicionReceptor(e.target.value as CondicionIva)}
                >
                  {RECEPTORES.map((r) => (
                    <option key={r.valor} value={r.valor}>
                      {r.etiqueta}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {clientes.length > 0 && (
              <div className="comprobante cliente-venta">
                <span className="tipo">Cliente</span>
                <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                  <option value="">— Consumidor final —</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Los fichados ya NO se ocultan al buscar: los resultados van al
              panel derecho, así el cajero nunca pierde de vista la venta. */}
          <div className="venta-actual">
              <ul className="items-lista">
                {carrito.length === 0 && <li className="vacio-grande">Agregá productos…</li>}
                {carrito.length > 0 && (
                  <li className="items-lista-encabezado">
                    <span>Descripción</span>
                    <span>Cant.</span>
                    <span>Unitario</span>
                    <span>Importe</span>
                    <span />
                  </li>
                )}
                {carrito.map((c) => {
                  const promo = promoDeItem(c);
                  const descPromo = promo
                    ? descuentoDeLinea(promo, c.cantidad, c.producto.precioFinal)
                    : Money.cero();
                  return (
                    <li key={c.producto.articulo.id} className="item-linea">
                      <span className="item-desc">
                        {c.producto.articulo.descripcion}
                        {promo && descPromo.esPositivo() && (
                          <span className="item-promo">
                            🏷 {promo.nombre} −{pesos(descPromo)}
                          </span>
                        )}
                      </span>
                      <div className="item-cant">
                        <button onClick={() => cambiarCantidad(c.producto.articulo.id, -1)}>−</button>
                        <span>{c.cantidad}</span>
                        <button onClick={() => cambiarCantidad(c.producto.articulo.id, 1)}>+</button>
                      </div>
                      <span className="item-unitario">{pesos(c.producto.precioFinal)}</span>
                      <span className="item-importe">
                        {pesos(c.producto.precioFinal.multiplicarPor(c.cantidad))}
                      </span>
                      <button
                        className="item-quitar"
                        onClick={() => quitar(c.producto.articulo.id)}
                        aria-label="Quitar"
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>

              {preview && (
                <div className="total-centro">
                  <span className="total-centro-items">
                    {carrito.length} {carrito.length === 1 ? "ítem" : "ítems"}
                  </span>
                  <span className="total-centro-etiqueta">TOTAL</span>
                  <span className="total-centro-valor">
                    {pesos(preview.resultado.total.sumar(recargoTarjetasTotal))}
                  </span>
                </div>
              )}
          </div>

          <div className="venta-pie">
          {preview && (
            <div className="totales">
              {preview.resultado.discriminaIva && (
                <>
                  <Fila etiqueta="Neto gravado" valor={pesos(preview.resultado.netoGravado)} />
                  {preview.resultado.subtotalesPorAlicuota.map((s) => (
                    <Fila
                      key={s.alicuota.porcentaje}
                      etiqueta={`IVA ${s.alicuota.etiqueta}`}
                      valor={pesos(s.iva)}
                    />
                  ))}
                </>
              )}
              {preview.resultado.descuento.esPositivo() && (
                <Fila etiqueta="Descuento" valor={`-${pesos(preview.resultado.descuento)}`} />
              )}
              <div className="fila recargo-ctrl">
                <span>Recargo</span>
                <span className="recargo-botones">
                  {[0, 10, 15].map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={recargoPorc === p ? "on" : ""}
                      onClick={() => setRecargoPorc(p)}
                    >
                      {p === 0 ? "Sin" : `${p}%`}
                    </button>
                  ))}
                </span>
              </div>
              {preview.resultado.recargo.esPositivo() && (
                <Fila etiqueta={`Recargo ${recargoPorc}%`} valor={`+${pesos(preview.resultado.recargo)}`} />
              )}
              {/* Fase 17: el TOTAL vive en el panel central (`.total-centro`),
                  donde el cajero ya está mirando la lista de productos. Acá
                  solo queda el desglose fiscal y los recargos. */}
              {recargoTarjetasTotal.esPositivo() && (
                <Fila etiqueta="Recargo tarjeta" valor={`+${pesos(recargoTarjetasTotal)}`} />
              )}
            </div>
          )}

          <div className="pagos">
            <div className="pagos-lista">
              {pagos.map((p, i) => (
                <div key={i} className="pago">
                  <span>
                    {FORMAS.find((f) => f.valor === p.forma)?.etiqueta ?? p.forma}
                    {p.tarjetaConfigId !== undefined && (
                      <>
                        {" "}
                        — {tarjetas.find((t) => t.id === p.tarjetaConfigId)?.banco ?? ""} ({p.cuotas}{" "}
                        cuota{p.cuotas === 1 ? "" : "s"})
                      </>
                    )}
                  </span>
                  <span>{pesos(p.monto)}</span>
                  <button onClick={() => quitarPago(i)} aria-label="Quitar pago">
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="cobrar-boton"
              onClick={() => abrirAsistente()}
              disabled={carrito.length === 0 || !preview}
            >
              Cobrar (Enter)
            </button>
            {preview && (
              <div className="cobro">
                <Fila etiqueta="Pagado" valor={pesos(preview.cobro.pagado)} />
                {preview.cobro.vuelto.esPositivo() && (
                  <Fila etiqueta="Vuelto" valor={pesos(preview.cobro.vuelto)} destacado />
                )}
                {!preview.cobro.cancelada && (
                  <Fila etiqueta="Falta" valor={pesos(preview.cobro.saldoPendiente)} />
                )}
              </div>
            )}
          </div>

          {error && <div className="error">{error}</div>}

          <button className="confirmar" onClick={() => void confirmar()} disabled={!puedeConfirmar}>
            Confirmar venta
          </button>
          </div>
        </section>

        {/* Columna de elegir productos: los resultados de la búsqueda salen
            acá (no en el centro), así los fichados quedan siempre a la vista.
            Sin búsqueda, muestra la grilla rápida curada. */}
        <aside className="panel-productos">
          <div className="panel-productos-titulo">
            {buscando ? `Resultados (${catalogoFiltrado.length})` : "Grilla rápida"}
          </div>
          <div className="grilla-productos">
            {buscando && catalogoFiltrado.length === 0 && (
              <div className="grilla-rapida-vacia">Sin resultados para "{busquedaProducto}".</div>
            )}
            {!buscando && productosGrillaRapida.length === 0 && (
              <div className="grilla-rapida-vacia">
                Marcá productos con ☆ (al buscarlos) para tenerlos acá.
              </div>
            )}
            {(buscando ? catalogoFiltrado : productosGrillaRapida).map((p, i) => (
              <div
                key={p.articulo.id}
                ref={buscando && i === cursorBusqueda ? itemBusquedaRef : null}
                className={
                  buscando && i === cursorBusqueda
                    ? "producto producto-chico resaltado"
                    : "producto producto-chico"
                }
                onClick={() => {
                  agregar(p);
                  if (buscando) {
                    setBusquedaProducto("");
                    setCursorBusqueda(0);
                  }
                }}
              >
                <button
                  type="button"
                  className="producto-estrella"
                  onClick={(e) => {
                    e.stopPropagation();
                    alternarGrillaRapida(p);
                  }}
                  aria-label={esGrillaRapida(p) ? "Sacar de grilla rápida" : "Agregar a grilla rápida"}
                >
                  {esGrillaRapida(p) ? "★" : "☆"}
                </button>
                <span className="producto-desc">{p.articulo.descripcion}</span>
                <span className="producto-precio">{pesos(p.precioFinal)}</span>
              </div>
            ))}
          </div>
        </aside>
      </main>

      {pasoAsistente !== "cerrado" && (
        <AsistenteCobro
          paso={pasoAsistente}
          cursor={cursorAsistente}
          formas={FORMAS}
          formaPago={formaPago}
          tarjetas={tarjetas}
          tarjetaActual={tarjetaActual}
          tasaActual={tasaActual}
          clientes={clientes}
          montoPago={montoPago}
          onCambiarMonto={setMontoPago}
          montoInputRef={montoAsistenteRef}
          recargoVivo={recargoVivo}
          montoBaseVivo={montoBaseVivo}
          saldoPendiente={preview?.cobro.saldoPendiente ?? Money.cero()}
          totalVenta={
            preview?.resultado.total.sumar(recargoTarjetasTotal) ??
            ventaAsistente?.venta.resultado.total ??
            Money.cero()
          }
          pagado={preview?.cobro.pagado ?? ventaAsistente?.venta.resultado.total ?? Money.cero()}
          vuelto={preview?.cobro.vuelto ?? ventaAsistente?.venta.vuelto ?? Money.cero()}
          pagos={pasoAsistente === "imprimir" && ventaAsistente ? ventaAsistente.pagos : pagos}
          onQuitarPago={quitarPago}
          error={error}
        />
      )}

      {ultimaVenta && (
        <div className="overlay" onClick={() => setUltimaVenta(null)}>
          <div className="ticket" onClick={(e) => e.stopPropagation()}>
            <div className="ticket-titulo">{etiquetaComprobante(ultimaVenta.tipoComprobante)}</div>
            <div className="ticket-numero">
              N° {String(ultimaVenta.puntoDeVenta).padStart(4, "0")}-
              {String(ultimaVenta.numero).padStart(8, "0")}
            </div>
            {ultimaVenta.estadoCae === EstadoCae.Autorizada ? (
              <div className="ticket-cae">
                <span className="badge-ok">AUTORIZADA</span>
                <span>CAE {ultimaVenta.cae}</span>
                {ultimaVenta.vencimientoCae && (
                  <span>Vto. {ultimaVenta.vencimientoCae.toLocaleDateString("es-AR")}</span>
                )}
              </div>
            ) : ultimaVenta.tipoComprobante === TipoComprobante.TicketNoFiscal ? (
              <div className="ticket-estado">No válido como factura</div>
            ) : (
              <div className="ticket-estado">
                {ultimaVenta.estadoCae === EstadoCae.Rechazada
                  ? "Rechazada por ARCA"
                  : "Pendiente de autorización de ARCA"}
              </div>
            )}
            <ul className="ticket-items">
              {ultimaVenta.items.map((it, i) => (
                <li key={i}>
                  <span>
                    {it.cantidad.aDecimalString(0)} × {it.descripcion}
                  </span>
                  <span>
                    {pesos(ultimaVenta.resultado.lineas[i]?.importe ?? it.precioUnitario)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="ticket-total">
              <span>TOTAL</span>
              <span>{pesos(ultimaVenta.resultado.total)}</span>
            </div>
            {ultimaVenta.vuelto.esPositivo() && (
              <div className="ticket-vuelto">
                <span>Vuelto</span>
                <span>{pesos(ultimaVenta.vuelto)}</span>
              </div>
            )}
            {error && <div className="error">{error}</div>}
            <div className="ticket-acciones">
              {ultimaVenta.estadoCae === EstadoCae.PendienteCae && (
                <button className="primario" onClick={autorizarCae}>
                  Solicitar CAE
                </button>
              )}
              {ultimaVenta.estadoCae === EstadoCae.Autorizada &&
                ultimaVenta.tipoComprobante.startsWith("Factura") && (
                  <button onClick={anularConNotaCredito}>Anular (NC)</button>
                )}
              <button onClick={() => imprimirTicket(ultimaVenta)} disabled={imprimiendo}>
                {imprimiendo ? "Imprimiendo…" : "Imprimir"}
              </button>
              <button onClick={() => imprimirA4(construirDatosTicket(ultimaVenta, config, catalogo, pagos, tarjetas))}>
                Imprimir A4
              </button>
              <button
                className="primario"
                onClick={() => {
                  setUltimaVenta(null);
                  setError(null);
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {pagoElectronico && (
        <div className="overlay">
          <div className="ticket">
            <div className="ticket-titulo">Pago electrónico</div>
            <div className="ticket-estado">
              {pagoElectronico.estado === "pendiente"
                ? "Esperando confirmación en el dispositivo…"
                : `Estado: ${pagoElectronico.estado}`}
            </div>
            {pagoElectronico.estado === "pendiente" && (
              <div className="ticket-acciones">
                <button onClick={cancelarPagoElectronico}>Cancelar pago</button>
              </div>
            )}
          </div>
        </div>
      )}

      {datosA4 && <ComprobanteA4 datos={datosA4} />}
      {datosTicket && <ComprobanteTicket datos={datosTicket} />}
    </div>
  );
}

function Fila({
  etiqueta,
  valor,
  destacado,
}: {
  etiqueta: string;
  valor: string;
  destacado?: boolean;
}) {
  return (
    <div className={destacado ? "fila destacado" : "fila"}>
      <span>{etiqueta}</span>
      <span>{valor}</span>
    </div>
  );
}

function construirDatosTicket(
  venta: VentaConfirmada,
  config: import("@nexosoft/app").ConfiguracionComercio,
  _catalogo: readonly ProductoCatalogo[],
  pagosUi: readonly PagoUi[],
  tarjetas: readonly Tarjeta[] = [],
): DatosTicket {
  return {
    razonSocial: config.razonSocial,
    cuit: config.cuit,
    condicionIvaEmisor: etiquetaCondicionIva(config.condicionIvaEmisor),
    puntoDeVenta: config.puntoDeVenta,
    ...(config.logoDataUrl !== undefined ? { logoDataUrl: config.logoDataUrl } : {}),
    tipoComprobante: etiquetaComprobante(venta.tipoComprobante),
    numero: venta.numero,
    fecha: new Date(),
    condicionIvaReceptor: etiquetaCondicionIva(venta.condicionIvaReceptor),
    esFiscal: venta.tipoComprobante !== TipoComprobante.TicketNoFiscal,
    lineas: venta.items.map((it, i) => ({
      descripcion: it.descripcion,
      cantidad: it.cantidad,
      precioUnitario: it.precioUnitario,
      importe: venta.resultado.lineas[i]?.importe ?? it.precioUnitario,
    })),
    subtotalesIva: venta.resultado.subtotalesPorAlicuota.map((s) => ({
      etiqueta: `IVA ${s.alicuota.etiqueta}`,
      base: s.neto,
      iva: s.iva,
    })),
    descuento: venta.resultado.descuento,
    total: venta.resultado.total,
    formasDePago: pagosUi.map((p) => {
      const base = FORMAS.find((f) => f.valor === p.forma)?.etiqueta ?? p.forma;
      const tarjeta = tarjetas.find((t) => t.id === p.tarjetaConfigId);
      const etiqueta =
        tarjeta !== undefined
          ? `${tarjeta.tipo === "CREDITO" ? "Tarjeta de crédito" : "Tarjeta de débito"} — ${tarjeta.banco} (${p.cuotas} cuota${p.cuotas === 1 ? "" : "s"})`
          : base;
      return { etiqueta, monto: p.monto };
    }),
    vuelto: venta.vuelto,
    ...(venta.cae !== undefined ? { cae: venta.cae } : {}),
    ...(venta.vencimientoCae !== undefined ? { vencimientoCae: venta.vencimientoCae } : {}),
  };
}
