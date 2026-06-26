import { useCallback, useEffect, useRef, useState } from "react";

import type { ComandoVenta, PrevisualizacionVenta, VentaConfirmada } from "@nexosoft/app";
import {
  Cantidad,
  CondicionIva,
  ErrorDominio,
  EstadoCae,
  FormaDePago,
  Money,
  resolverTipoComprobante,
} from "@nexosoft/domain";
import type { DatosTicket } from "@nexosoft/hardware";
import type { IntentoPago } from "@nexosoft/pagos";

import type { EntornoPos, ProductoCatalogo } from "../datos/bootstrap";
import { etiquetaComprobante, pesos } from "../formato";

interface ItemCarrito {
  readonly producto: ProductoCatalogo;
  readonly cantidad: number;
}
interface PagoUi {
  readonly forma: FormaDePago;
  readonly monto: Money;
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
];

function mensajeError(e: unknown): string {
  if (e instanceof ErrorDominio) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}

function armarComando(
  carrito: readonly ItemCarrito[],
  condicionReceptor: CondicionIva,
  pagos: readonly PagoUi[],
): ComandoVenta {
  return {
    items: carrito.map((c) => ({
      articuloId: c.producto.articulo.id,
      cantidad: Cantidad.de(String(c.cantidad)),
    })),
    condicionReceptor,
    pagos: pagos.map((p) => ({ forma: p.forma, monto: p.monto })),
  };
}

export function PantallaPos({ entorno }: { entorno: EntornoPos }) {
  const { servicio, config, catalogo, impresora, lector, pasarela } = entorno;

  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [condicionReceptor, setCondicionReceptor] = useState<CondicionIva>(
    CondicionIva.ConsumidorFinal,
  );
  const [pagos, setPagos] = useState<PagoUi[]>([]);
  const [preview, setPreview] = useState<PrevisualizacionVenta | null>(null);
  const [ultimaVenta, setUltimaVenta] = useState<VentaConfirmada | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formaPago, setFormaPago] = useState<FormaDePago>(FormaDePago.Efectivo);
  const [montoPago, setMontoPago] = useState<string>("");
  const [imprimiendo, setImprimiendo] = useState(false);
  const [pagoElectronico, setPagoElectronico] = useState<IntentoPago | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ----- Lector de barras HID -----
  // Los lectores HID se comportan como teclado: acumulamos teclas hasta Enter.
  const bufferLector = useRef("");
  const buscarPorCodigo = useCallback(
    (codigo: string) => {
      const prod = catalogo.find((p) => p.articulo.codigoInterno === codigo);
      if (prod) agregar(prod);
      else setError(`Código de barras no encontrado: ${codigo}`);
    },
    // agregar se define más abajo, pero es estable porque usa setCarrito funcional
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalogo],
  );

  useEffect(() => {
    // Suscripción al lector (mock o real vía puerto)
    const unsub = lector.onEscaneo(buscarPorCodigo);

    // Captura teclado global para lectores HID plug-and-play
    function onKeyDown(e: KeyboardEvent) {
      // Ignorar si el foco está en un input (el usuario está escribiendo)
      if (document.activeElement?.tagName === "INPUT") return;
      if (e.key === "Enter") {
        const codigo = bufferLector.current.trim();
        bufferLector.current = "";
        if (codigo.length > 0) buscarPorCodigo(codigo);
      } else if (e.key.length === 1) {
        bufferLector.current += e.key;
      }
    }
    window.addEventListener("keydown", onKeyDown);

    return () => {
      unsub();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [lector, buscarPorCodigo]);

  useEffect(() => {
    if (carrito.length === 0) {
      setPreview(null);
      return;
    }
    let vivo = true;
    servicio
      .previsualizarVenta(armarComando(carrito, condicionReceptor, pagos))
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
  }, [carrito, condicionReceptor, pagos, servicio]);

  const tipo = resolverTipoComprobante(config.condicionIvaEmisor, condicionReceptor);

  function agregar(producto: ProductoCatalogo) {
    setError(null);
    setCarrito((prev) => {
      const actual = prev.find((c) => c.producto.articulo.id === producto.articulo.id);
      if (actual) {
        return prev.map((c) => (c === actual ? { ...c, cantidad: c.cantidad + 1 } : c));
      }
      return [...prev, { producto, cantidad: 1 }];
    });
  }

  function cambiarCantidad(id: string, delta: number) {
    setCarrito((prev) =>
      prev.flatMap((c) => {
        if (c.producto.articulo.id !== id) return [c];
        const nueva = c.cantidad + delta;
        return nueva <= 0 ? [] : [{ ...c, cantidad: nueva }];
      }),
    );
  }

  function quitar(id: string) {
    setCarrito((prev) => prev.filter((c) => c.producto.articulo.id !== id));
  }

  function agregarPago() {
    try {
      const monto = Money.desde(montoPago.replace(",", "."));
      if (!monto.esPositivo()) {
        setError("El monto del pago debe ser mayor a cero.");
        return;
      }
      setPagos((prev) => [...prev, { forma: formaPago, monto }]);
      setMontoPago("");
      setError(null);
    } catch {
      setError("Monto de pago inválido.");
    }
  }

  function pagoExacto() {
    if (!preview) return;
    const saldo = preview.cobro.saldoPendiente;
    if (saldo.esPositivo()) {
      setPagos((prev) => [...prev, { forma: FormaDePago.Efectivo, monto: saldo }]);
    }
  }

  function quitarPago(indice: number) {
    setPagos((prev) => prev.filter((_, i) => i !== indice));
  }

  async function confirmar() {
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
              await _finalizarVenta();
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

    await _finalizarVenta();
  }

  async function _finalizarVenta() {
    try {
      const venta = await servicio.confirmarVenta(armarComando(carrito, condicionReceptor, pagos));
      setUltimaVenta(venta);
      setCarrito([]);
      setPagos([]);
      setError(null);
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

  async function imprimirTicket(venta: VentaConfirmada) {
    if (imprimiendo) return;
    setImprimiendo(true);
    try {
      const datos = construirDatosTicket(venta, config, catalogo, pagos);
      await impresora.imprimirTicket(datos);
    } catch (e) {
      setError(`Error al imprimir: ${mensajeError(e)}`);
    } finally {
      setImprimiendo(false);
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

  return (
    <div className="pos">
      <header className="barra">
        <div className="marca">
          Nexo<span>Soft</span>
        </div>
        <div className="comercio">
          <strong>{config.razonSocial}</strong>
          <span>
            Responsable Inscripto · Punto de venta {String(config.puntoDeVenta).padStart(4, "0")}
          </span>
        </div>
      </header>

      <main className="cuerpo">
        <section className="catalogo">
          {catalogo.map((p) => (
            <button key={p.articulo.id} className="producto" onClick={() => agregar(p)}>
              <span className="producto-desc">{p.articulo.descripcion}</span>
              <span className="producto-precio">{pesos(p.precioFinal)}</span>
            </button>
          ))}
        </section>

        <aside className="ticket-panel">
          <div className="comprobante">
            <span className="tipo">{etiquetaComprobante(tipo)}</span>
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
          </div>

          <ul className="items">
            {carrito.length === 0 && <li className="vacio">Agregá productos…</li>}
            {carrito.map((c) => (
              <li key={c.producto.articulo.id} className="item">
                <span className="item-desc">{c.producto.articulo.descripcion}</span>
                <div className="item-cant">
                  <button onClick={() => cambiarCantidad(c.producto.articulo.id, -1)}>−</button>
                  <span>{c.cantidad}</span>
                  <button onClick={() => cambiarCantidad(c.producto.articulo.id, 1)}>+</button>
                </div>
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
            ))}
          </ul>

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
              <Fila etiqueta="TOTAL" valor={pesos(preview.resultado.total)} destacado />
            </div>
          )}

          <div className="pagos">
            <div className="pagos-lista">
              {pagos.map((p, i) => (
                <div key={i} className="pago">
                  <span>{FORMAS.find((f) => f.valor === p.forma)?.etiqueta ?? p.forma}</span>
                  <span>{pesos(p.monto)}</span>
                  <button onClick={() => quitarPago(i)} aria-label="Quitar pago">
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="pago-nuevo">
              <select
                value={formaPago}
                onChange={(e) => setFormaPago(e.target.value as FormaDePago)}
              >
                {FORMAS.map((f) => (
                  <option key={f.valor} value={f.valor}>
                    {f.etiqueta}
                  </option>
                ))}
              </select>
              <input
                type="text"
                inputMode="decimal"
                placeholder="Monto"
                value={montoPago}
                onChange={(e) => setMontoPago(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") agregarPago();
                }}
              />
              <button onClick={agregarPago}>Agregar</button>
              <button className="exacto" onClick={pagoExacto} disabled={!preview}>
                Exacto
              </button>
            </div>
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

          <button className="confirmar" onClick={confirmar} disabled={!puedeConfirmar}>
            Confirmar venta
          </button>
        </aside>
      </main>

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
            ) : (
              <div className="ticket-estado">{ultimaVenta.estadoCae}</div>
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
): DatosTicket {
  return {
    razonSocial: config.razonSocial,
    cuit: config.cuit,
    condicionIvaEmisor: config.condicionIvaEmisor,
    puntoDeVenta: config.puntoDeVenta,
    tipoComprobante: venta.tipoComprobante,
    numero: venta.numero,
    fecha: new Date(),
    condicionIvaReceptor: venta.condicionIvaReceptor,
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
    formasDePago: pagosUi.map((p) => ({
      etiqueta: FORMAS.find((f) => f.valor === p.forma)?.etiqueta ?? p.forma,
      monto: p.monto,
    })),
    vuelto: venta.vuelto,
    ...(venta.cae !== undefined ? { cae: venta.cae } : {}),
    ...(venta.vencimientoCae !== undefined ? { vencimientoCae: venta.vencimientoCae } : {}),
  };
}
