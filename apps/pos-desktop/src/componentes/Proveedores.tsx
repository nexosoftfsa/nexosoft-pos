/**
 * Pantalla de Proveedores (Fase 12): alta, edición y baja (soft-delete) de
 * proveedores. ABM simple, sin cuenta corriente — a diferencia de Clientes
 * (`CuentasCorrientes.tsx`, ADR-0027). Online contra el módulo de
 * proveedores del cloud-api.
 */
import { useCallback, useEffect, useState } from "react";

import { ErrorProveedores, type ClienteProveedores, type Proveedor } from "../sync/cliente-proveedores";
import {
  aDatosProveedor,
  filtrarProveedores,
  FORM_PROVEEDOR_VACIO,
  formDesdeProveedor,
  validarProveedor,
  type FormProveedor,
} from "./proveedores-helpers";

function mensaje(e: unknown): string {
  if (e instanceof ErrorProveedores) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}

export function Proveedores({ cliente: api }: { cliente: ClienteProveedores }) {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [incluirInactivos, setIncluirInactivos] = useState(false);
  const [editando, setEditando] = useState<Proveedor | "nuevo" | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setProveedores(await api.listar(incluirInactivos));
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setCargando(false);
    }
  }, [api, incluirInactivos]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const filtrados = filtrarProveedores(proveedores, busqueda);

  async function desactivar(p: Proveedor) {
    if (!window.confirm(`¿Desactivar a "${p.nombre}"? Se puede reactivar luego.`)) return;
    try {
      await api.desactivar(p.id);
      await cargar();
    } catch (e) {
      setError(mensaje(e));
    }
  }

  return (
    <div className="gestion">
      <div className="toolbar">
        <div className="searchbar searchbar--gestion">
          <input
            placeholder="Buscar por nombre, CUIT o contacto…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={incluirInactivos}
            onChange={(e) => setIncluirInactivos(e.target.checked)}
          />
          Mostrar inactivos
        </label>
        <div className="spacer" />
        <button type="button" className="pill-btn pill-btn--primary" onClick={() => setEditando("nuevo")}>
          + Nuevo proveedor
        </button>
      </div>

      {error !== null && <div className="error">{error}</div>}

      <div className="card">
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Proveedor</th>
                <th>CUIT</th>
                <th>Contacto</th>
                <th>Teléfono</th>
                <th>Email</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cargando && (
                <tr>
                  <td colSpan={7} className="td-vacio">
                    Cargando proveedores…
                  </td>
                </tr>
              )}
              {!cargando && filtrados.length === 0 && (
                <tr>
                  <td colSpan={7} className="td-vacio">
                    No hay proveedores para mostrar.
                  </td>
                </tr>
              )}
              {!cargando &&
                filtrados.map((p) => (
                  <tr key={p.id} className={p.activo ? "" : "fila-inactiva"}>
                    <td className="strong">{p.nombre}</td>
                    <td>{p.cuit ?? <span className="muted">—</span>}</td>
                    <td>{p.contacto ?? <span className="muted">—</span>}</td>
                    <td>{p.telefono ?? <span className="muted">—</span>}</td>
                    <td>{p.email ?? <span className="muted">—</span>}</td>
                    <td>
                      {p.activo ? (
                        <span className="badge badge--ok">Activo</span>
                      ) : (
                        <span className="badge badge--n">Inactivo</span>
                      )}
                    </td>
                    <td className="acciones">
                      <button type="button" className="linkbtn" onClick={() => setEditando(p)}>
                        Editar
                      </button>
                      {p.activo && (
                        <button
                          type="button"
                          className="linkbtn linkbtn--danger"
                          onClick={() => void desactivar(p)}
                        >
                          Baja
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {editando !== null && (
        <ModalProveedor
          api={api}
          proveedor={editando === "nuevo" ? null : editando}
          onCerrar={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null);
            void cargar();
          }}
        />
      )}
    </div>
  );
}

function ModalProveedor({
  api,
  proveedor,
  onCerrar,
  onGuardado,
}: {
  api: ClienteProveedores;
  proveedor: Proveedor | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [form, setForm] = useState<FormProveedor>(() =>
    proveedor === null ? FORM_PROVEEDOR_VACIO : formDesdeProveedor(proveedor),
  );
  const [errores, setErrores] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  function campo<K extends keyof FormProveedor>(clave: K, valor: FormProveedor[K]) {
    setForm((f) => ({ ...f, [clave]: valor }));
  }

  async function guardar() {
    const e = validarProveedor(form);
    if (e.length > 0) {
      setErrores(e);
      return;
    }
    setGuardando(true);
    setErrores([]);
    try {
      const datos = aDatosProveedor(form);
      if (proveedor === null) await api.crear(datos);
      else await api.actualizar(proveedor.id, datos);
      onGuardado();
    } catch (err) {
      setErrores([mensaje(err)]);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="modal modal--show" onClick={onCerrar}>
      <div className="modal__box" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h3>{proveedor === null ? "Nuevo proveedor" : `Editar — ${proveedor.nombre}`}</h3>
          <button type="button" className="modal__x" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className="modal__body">
          <div className="field">
            <label>Nombre / Razón social</label>
            <input className="input" value={form.nombre} onChange={(e) => campo("nombre", e.target.value)} />
          </div>
          <div className="modal__row">
            <div className="field">
              <label>CUIT</label>
              <input className="input" value={form.cuit} onChange={(e) => campo("cuit", e.target.value)} />
            </div>
            <div className="field">
              <label>Contacto</label>
              <input className="input" value={form.contacto} onChange={(e) => campo("contacto", e.target.value)} />
            </div>
          </div>
          <div className="modal__row">
            <div className="field">
              <label>Teléfono</label>
              <input className="input" value={form.telefono} onChange={(e) => campo("telefono", e.target.value)} />
            </div>
            <div className="field">
              <label>Email</label>
              <input className="input" value={form.email} onChange={(e) => campo("email", e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>Dirección</label>
            <input className="input" value={form.direccion} onChange={(e) => campo("direccion", e.target.value)} />
          </div>
          {errores.length > 0 && (
            <div className="error">
              {errores.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}
        </div>
        <div className="modal__foot">
          <button type="button" className="pill-btn" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </button>
          <button type="button" className="pill-btn pill-btn--primary" onClick={() => void guardar()} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
