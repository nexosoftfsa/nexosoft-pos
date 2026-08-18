/**
 * Pantalla de Presupuestos (Fase 7.8): comprobantes NO fiscales. Armar, listar,
 * ver/imprimir, convertir (marcar) y anular. Online contra el cloud-api.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { Money } from "@nexosoft/domain";

import { descargarBlob } from "../descargas";
import { exportarExcel } from "../exportar-excel";
import {
  ErrorPresupuestos,
  type ClientePresupuestos,
  type DatosItemPresupuesto,
  type Presupuesto,
} from "../sync/cliente-presupuestos";
import { pesos } from "../formato";
import {
  ETIQUETA_ESTADO,
  estaVencido,
  fechaVencimiento,
  normalizarImporte,
  validarLinea,
} from "./presupuestos-helpers";

export interface ProductoPresup {
  readonly id: string;
  readonly descripcion: string;
  readonly precio: string;
}

function mensaje(e: unknown): string {
  if (e instanceof ErrorPresupuestos) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}
function money(v: string): string {
  try {
    return pesos(Money.desde(v));
  } catch {
    return v;
  }
}
function fecha(d: string | Date): string {
  const x = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(x.getTime()) ? String(d) : x.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function etiquetaEstadoPresupuesto(p: Presupuesto): string {
  if (p.estado === "VIGENTE") return estaVencido(p.creadoEn, p.validezDias, p.estado) ? "Vencido" : "Vigente";
  return ETIQUETA_ESTADO[p.estado];
}

export function Presupuestos({
  cliente,
  catalogo,
}: {
  cliente: ClientePresupuestos;
  catalogo: readonly ProductoPresup[];
}) {
  const [items, setItems] = useState<Presupuesto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [ver, setVer] = useState<Presupuesto | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setItems(await cliente.listar());
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setCargando(false);
    }
  }, [cliente]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function accion(p: Presupuesto, tipo: "convertir" | "anular") {
    const verbo = tipo === "anular" ? "anular" : "convertir en venta";
    if (!window.confirm(`¿Querés ${verbo} el presupuesto N° ${p.numero}?`)) return;
    setError(null);
    setAviso(null);
    try {
      if (tipo === "anular") {
        await cliente.anular(p.id);
      } else {
        const r = await cliente.convertir(p.id);
        const comp = `${r.venta.tipoComprobante ?? "Comprobante"} N° ${r.venta.numeroComprobante ?? "—"}`;
        setAviso(`Presupuesto N° ${p.numero} convertido en venta (${comp}). Se descontó el stock.`);
      }
      await cargar();
    } catch (e) {
      setError(mensaje(e));
    }
  }

  async function exportar() {
    try {
      const blob = await exportarExcel([
        {
          nombre: "Presupuestos",
          columnas: [
            { titulo: "N°" },
            { titulo: "Cliente", ancho: 24 },
            { titulo: "Fecha" },
            { titulo: "Vence" },
            { titulo: "Total" },
            { titulo: "Estado" },
          ],
          filas: items.map((p) => [
            p.numero,
            p.clienteNombre ?? "",
            fecha(p.creadoEn),
            fecha(fechaVencimiento(p.creadoEn, p.validezDias)),
            money(p.total),
            etiquetaEstadoPresupuesto(p),
          ]),
        },
      ]);
      await descargarBlob("presupuestos.xlsx", blob);
    } catch (e) {
      setError(mensaje(e));
    }
  }

  return (
    <div className="gestion">
      <div className="toolbar">
        <div className="spacer" />
        <button type="button" className="pill-btn" onClick={() => void exportar()}>
          Exportar
        </button>
        <button type="button" className="pill-btn pill-btn--primary" onClick={() => setNuevo(true)}>
          + Nuevo presupuesto
        </button>
      </div>

      {error !== null && <div className="error">{error}</div>}
      {aviso !== null && <div className="aviso-ok">{aviso}</div>}

      <div className="card">
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>N°</th>
                <th>Cliente</th>
                <th>Fecha</th>
                <th>Vence</th>
                <th className="num">Total</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cargando && (
                <tr>
                  <td colSpan={7} className="td-vacio">Cargando presupuestos…</td>
                </tr>
              )}
              {!cargando && items.length === 0 && (
                <tr>
                  <td colSpan={7} className="td-vacio">No hay presupuestos.</td>
                </tr>
              )}
              {!cargando &&
                items.map((p) => {
                  const vencido = estaVencido(p.creadoEn, p.validezDias, p.estado);
                  return (
                    <tr key={p.id}>
                      <td className="strong">{p.numero}</td>
                      <td>{p.clienteNombre ?? <span className="muted">—</span>}</td>
                      <td>{fecha(p.creadoEn)}</td>
                      <td>{fecha(fechaVencimiento(p.creadoEn, p.validezDias))}</td>
                      <td className="num strong">{money(p.total)}</td>
                      <td>
                        {p.estado === "VIGENTE" && !vencido && <span className="badge badge--ok">Vigente</span>}
                        {p.estado === "VIGENTE" && vencido && <span className="badge badge--warn">Vencido</span>}
                        {p.estado === "CONVERTIDO" && <span className="badge badge--info">Convertido</span>}
                        {p.estado === "ANULADO" && <span className="badge badge--danger">Anulado</span>}
                      </td>
                      <td className="acciones">
                        <button type="button" className="linkbtn" onClick={() => setVer(p)}>
                          Ver
                        </button>
                        {p.estado === "VIGENTE" && (
                          <>
                            <button type="button" className="linkbtn" onClick={() => void accion(p, "convertir")}>
                              Convertir
                            </button>
                            <button type="button" className="linkbtn linkbtn--danger" onClick={() => void accion(p, "anular")}>
                              Anular
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {nuevo && (
        <ModalNuevo
          cliente={cliente}
          catalogo={catalogo}
          onCerrar={() => setNuevo(false)}
          onCreado={() => {
            setNuevo(false);
            void cargar();
          }}
        />
      )}
      {ver !== null && <ModalVer presupuesto={ver} onCerrar={() => setVer(null)} />}
    </div>
  );
}

interface LineaNueva extends DatosItemPresupuesto {
  readonly subtotal: string;
}

function ModalNuevo({
  cliente,
  catalogo,
  onCerrar,
  onCreado,
}: {
  cliente: ClientePresupuestos;
  catalogo: readonly ProductoPresup[];
  onCerrar: () => void;
  onCreado: () => void;
}) {
  const [clienteNombre, setClienteNombre] = useState("");
  const [validez, setValidez] = useState("15");
  const [lineas, setLineas] = useState<LineaNueva[]>([]);
  const [sel, setSel] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [precio, setPrecio] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  function elegirProducto(id: string) {
    setSel(id);
    const p = catalogo.find((c) => c.id === id);
    if (p) {
      setDescripcion(p.descripcion);
      setPrecio(p.precio);
    }
  }

  function agregarLinea() {
    const err = validarLinea(descripcion, cantidad, precio);
    if (err !== null) {
      setError(err);
      return;
    }
    const cant = normalizarImporte(cantidad);
    const pu = normalizarImporte(precio);
    const subtotal = (Number(cant) * Number(pu)).toFixed(2);
    setLineas((l) => [
      ...l,
      { descripcion: descripcion.trim(), cantidad: cant, precioUnitario: pu, subtotal, ...(sel !== "" ? { productoId: sel } : {}) },
    ]);
    setSel("");
    setDescripcion("");
    setCantidad("1");
    setPrecio("");
    setError(null);
  }

  const total = useMemo(() => lineas.reduce((a, l) => a + Number(l.subtotal), 0).toFixed(2), [lineas]);

  async function guardar() {
    if (lineas.length === 0) {
      setError("Agregá al menos un ítem.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await cliente.crear({
        ...(clienteNombre.trim() !== "" ? { clienteNombre: clienteNombre.trim() } : {}),
        validezDias: Number(validez) || 15,
        items: lineas.map((l) => ({
          descripcion: l.descripcion,
          cantidad: l.cantidad,
          precioUnitario: l.precioUnitario,
          ...(l.productoId !== undefined ? { productoId: l.productoId } : {}),
        })),
      });
      onCreado();
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="modal modal--show" onClick={onCerrar}>
      <div className="modal__box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="modal__head">
          <h3>Nuevo presupuesto</h3>
          <button type="button" className="modal__x" onClick={onCerrar} aria-label="Cerrar">×</button>
        </div>
        <div className="modal__body">
          <div className="modal__row">
            <div className="field">
              <label>Cliente (opcional)</label>
              <input className="input" value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} />
            </div>
            <div className="field">
              <label>Validez (días)</label>
              <input className="input" inputMode="numeric" value={validez} onChange={(e) => setValidez(e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label>Agregar ítem</label>
            <select className="input" value={sel} onChange={(e) => elegirProducto(e.target.value)}>
              <option value="">— Elegí un producto o escribí abajo —</option>
              {catalogo.map((c) => (
                <option key={c.id} value={c.id}>{c.descripcion}</option>
              ))}
            </select>
          </div>
          <div className="modal__row">
            <div className="field">
              <label>Descripción</label>
              <input className="input" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
            </div>
            <div className="field">
              <label>Cantidad</label>
              <input className="input" inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
            </div>
          </div>
          <div className="modal__row">
            <div className="field">
              <label>Precio unitario</label>
              <input className="input" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} />
            </div>
            <div className="field" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="pill-btn" onClick={agregarLinea}>+ Agregar ítem</button>
            </div>
          </div>

          {lineas.length > 0 && (
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Descripción</th>
                    <th className="num">Cant.</th>
                    <th className="num">P. unit.</th>
                    <th className="num">Subtotal</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((l, i) => (
                    <tr key={i}>
                      <td>{l.descripcion}</td>
                      <td className="num">{l.cantidad}</td>
                      <td className="num">{money(l.precioUnitario)}</td>
                      <td className="num strong">{money(l.subtotal)}</td>
                      <td className="acciones">
                        <button type="button" className="linkbtn linkbtn--danger" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))}>
                          Quitar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="kv">
            <span>Total</span>
            <b>{money(total)}</b>
          </div>
          {error !== null && <div className="error">{error}</div>}
        </div>
        <div className="modal__foot">
          <button type="button" className="pill-btn" onClick={onCerrar} disabled={guardando}>Cancelar</button>
          <button type="button" className="pill-btn pill-btn--primary" onClick={() => void guardar()} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar presupuesto"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalVer({ presupuesto, onCerrar }: { presupuesto: Presupuesto; onCerrar: () => void }) {
  return (
    <div className="overlay" onClick={onCerrar}>
      <div className="ticket" onClick={(e) => e.stopPropagation()}>
        <div className="ticket-titulo">Presupuesto N° {presupuesto.numero}</div>
        <div className="ticket-numero">
          {presupuesto.clienteNombre ?? "Consumidor Final"} · {ETIQUETA_ESTADO[presupuesto.estado]}
        </div>
        <ul className="ticket-items">
          {presupuesto.items.map((it) => (
            <li key={it.id}>
              <span>{it.cantidad} × {it.descripcion}</span>
              <span>{money(it.subtotal)}</span>
            </li>
          ))}
        </ul>
        <div className="ticket-total">
          <span>TOTAL</span>
          <span>{money(presupuesto.total)}</span>
        </div>
        <div className="ticket-vuelto">
          <span>Válido hasta</span>
          <span>{fecha(fechaVencimiento(presupuesto.creadoEn, presupuesto.validezDias))}</span>
        </div>
        <div className="ticket-acciones">
          <button onClick={() => window.print()}>Imprimir</button>
          <button className="primario" onClick={onCerrar}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
