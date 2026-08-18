/**
 * Pantalla de Remitos (Fase 7.8): documento de entrega NO fiscal (sin precios).
 * Armar, listar, ver/imprimir y anular. Online contra el cloud-api.
 */
import { useCallback, useEffect, useState } from "react";

import { descargarBlob } from "../descargas";
import { exportarExcel } from "../exportar-excel";
import {
  ErrorRemitos,
  type ClienteRemitos,
  type DatosItemRemito,
  type Remito,
} from "../sync/cliente-remitos";
import { normalizarCantidad, validarLineaRemito } from "./remitos-helpers";

export interface ProductoRemito {
  readonly id: string;
  readonly descripcion: string;
}

function mensaje(e: unknown): string {
  if (e instanceof ErrorRemitos) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}
function fecha(d: string): string {
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? d : x.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function Remitos({
  cliente,
  catalogo,
}: {
  cliente: ClienteRemitos;
  catalogo: readonly ProductoRemito[];
}) {
  const [items, setItems] = useState<Remito[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [ver, setVer] = useState<Remito | null>(null);

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

  async function anular(r: Remito) {
    if (!window.confirm(`¿Anular el remito N° ${r.numero}?`)) return;
    try {
      await cliente.anular(r.id);
      await cargar();
    } catch (e) {
      setError(mensaje(e));
    }
  }

  async function exportar() {
    try {
      const blob = await exportarExcel([
        {
          nombre: "Remitos",
          columnas: [{ titulo: "N°" }, { titulo: "Cliente", ancho: 24 }, { titulo: "Fecha" }, { titulo: "Ítems" }, { titulo: "Estado" }],
          filas: items.map((r) => [
            r.numero,
            r.clienteNombre ?? "",
            fecha(r.creadoEn),
            r.items.length,
            r.estado === "EMITIDO" ? "Emitido" : "Anulado",
          ]),
        },
      ]);
      await descargarBlob("remitos.xlsx", blob);
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
          + Nuevo remito
        </button>
      </div>

      {error !== null && <div className="error">{error}</div>}

      <div className="card">
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>N°</th>
                <th>Cliente</th>
                <th>Fecha</th>
                <th className="num">Ítems</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cargando && (
                <tr>
                  <td colSpan={6} className="td-vacio">Cargando remitos…</td>
                </tr>
              )}
              {!cargando && items.length === 0 && (
                <tr>
                  <td colSpan={6} className="td-vacio">No hay remitos.</td>
                </tr>
              )}
              {!cargando &&
                items.map((r) => (
                  <tr key={r.id}>
                    <td className="strong">{r.numero}</td>
                    <td>{r.clienteNombre ?? <span className="muted">—</span>}</td>
                    <td>{fecha(r.creadoEn)}</td>
                    <td className="num">{r.items.length}</td>
                    <td>
                      {r.estado === "EMITIDO" ? (
                        <span className="badge badge--ok">Emitido</span>
                      ) : (
                        <span className="badge badge--danger">Anulado</span>
                      )}
                    </td>
                    <td className="acciones">
                      <button type="button" className="linkbtn" onClick={() => setVer(r)}>Ver</button>
                      {r.estado === "EMITIDO" && (
                        <button type="button" className="linkbtn linkbtn--danger" onClick={() => void anular(r)}>
                          Anular
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
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
      {ver !== null && <ModalVer remito={ver} onCerrar={() => setVer(null)} />}
    </div>
  );
}

function ModalNuevo({
  cliente,
  catalogo,
  onCerrar,
  onCreado,
}: {
  cliente: ClienteRemitos;
  catalogo: readonly ProductoRemito[];
  onCerrar: () => void;
  onCreado: () => void;
}) {
  const [clienteNombre, setClienteNombre] = useState("");
  const [lineas, setLineas] = useState<DatosItemRemito[]>([]);
  const [sel, setSel] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  function elegir(id: string) {
    setSel(id);
    const p = catalogo.find((c) => c.id === id);
    if (p) setDescripcion(p.descripcion);
  }

  function agregar() {
    const err = validarLineaRemito(descripcion, cantidad);
    if (err !== null) {
      setError(err);
      return;
    }
    setLineas((l) => [
      ...l,
      { descripcion: descripcion.trim(), cantidad: normalizarCantidad(cantidad), ...(sel !== "" ? { productoId: sel } : {}) },
    ]);
    setSel("");
    setDescripcion("");
    setCantidad("1");
    setError(null);
  }

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
        items: lineas,
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
      <div className="modal__box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal__head">
          <h3>Nuevo remito</h3>
          <button type="button" className="modal__x" onClick={onCerrar} aria-label="Cerrar">×</button>
        </div>
        <div className="modal__body">
          <div className="field">
            <label>Cliente (opcional)</label>
            <input className="input" value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} />
          </div>
          <div className="field">
            <label>Agregar ítem</label>
            <select className="input" value={sel} onChange={(e) => elegir(e.target.value)}>
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
          <div style={{ textAlign: "right" }}>
            <button type="button" className="pill-btn" onClick={agregar}>+ Agregar ítem</button>
          </div>

          {lineas.length > 0 && (
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Descripción</th>
                    <th className="num">Cantidad</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((l, i) => (
                    <tr key={i}>
                      <td>{l.descripcion}</td>
                      <td className="num">{l.cantidad}</td>
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
          {error !== null && <div className="error">{error}</div>}
        </div>
        <div className="modal__foot">
          <button type="button" className="pill-btn" onClick={onCerrar} disabled={guardando}>Cancelar</button>
          <button type="button" className="pill-btn pill-btn--primary" onClick={() => void guardar()} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar remito"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalVer({ remito, onCerrar }: { remito: Remito; onCerrar: () => void }) {
  return (
    <div className="overlay" onClick={onCerrar}>
      <div className="ticket" onClick={(e) => e.stopPropagation()}>
        <div className="ticket-titulo">Remito N° {remito.numero}</div>
        <div className="ticket-numero">{remito.clienteNombre ?? "Sin cliente"}</div>
        <ul className="ticket-items">
          {remito.items.map((it) => (
            <li key={it.id}>
              <span>{it.descripcion}</span>
              <span>{it.cantidad}</span>
            </li>
          ))}
        </ul>
        {remito.observaciones !== null && <div className="ticket-numero">{remito.observaciones}</div>}
        <div className="ticket-acciones">
          <button onClick={() => window.print()}>Imprimir</button>
          <button className="primario" onClick={onCerrar}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
