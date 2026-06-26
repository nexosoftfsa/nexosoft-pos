import { useEffect, useState } from "react";

import type { ComandoVenta, PrevisualizacionVenta, VentaConfirmada } from "@nexosoft/app";
import {
  Cantidad,
  CondicionIva,
  ErrorDominio,
  FormaDePago,
  Money,
  resolverTipoComprobante,
} from "@nexosoft/domain";

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
const FORMAS: ReadonlyArray<{ valor: FormaDePago; etiqueta: string }> = [
  { valor: FormaDePago.Efectivo, etiqueta: "Efectivo" },
  { valor: FormaDePago.Tarjeta, etiqueta: "Tarjeta" },
  { valor: FormaDePago.Billetera, etiqueta: "Billetera (QR)" },
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
  const { servicio, config, catalogo } = entorno;

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
            <div className="ticket-estado">{ultimaVenta.estadoCae}</div>
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
            <div className="ticket-acciones">
              <button onClick={() => window.print()}>Imprimir</button>
              <button className="primario" onClick={() => setUltimaVenta(null)}>
                Nueva venta
              </button>
            </div>
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
