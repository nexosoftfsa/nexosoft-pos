/**
 * Pantalla de Medios de pago (Fase 12.E): tarjetas por banco con sus tasas
 * de recargo según cantidad de cuotas. ABM calcado de Proveedores.tsx, con
 * un editor anidado de tasas por cuotas en el modal de alta/edición. Online
 * contra el módulo de medios de pago del cloud-api.
 */
import { useCallback, useEffect, useState } from "react";

import { descargarBlob } from "../descargas";
import { exportarExcel } from "../exportar-excel";
import {
  ErrorMediosPago,
  type ClienteMediosPago,
  type Tarjeta,
} from "../sync/cliente-medios-pago";
import {
  aDatosTarjeta,
  filtrarTarjetas,
  FORM_TARJETA_VACIO,
  formDesdeTarjeta,
  TASA_VACIA,
  TIPOS_TARJETA,
  validarTarjeta,
  type FormTarjeta,
} from "./medios-pago-helpers";

function mensaje(e: unknown): string {
  if (e instanceof ErrorMediosPago) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}

function etiquetaTipo(tipo: Tarjeta["tipo"]): string {
  return TIPOS_TARJETA.find((t) => t.valor === tipo)?.etiqueta ?? tipo;
}

function etiquetaTasas(t: Tarjeta): string {
  return t.tasas.length === 0
    ? ""
    : t.tasas.map((r) => `${r.cantidadCuotas}c: ${r.recargoPorcentaje}%`).join(" · ");
}

export function MediosDePago({ cliente: api }: { cliente: ClienteMediosPago }) {
  const [tarjetas, setTarjetas] = useState<Tarjeta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [incluirInactivas, setIncluirInactivas] = useState(false);
  const [editando, setEditando] = useState<Tarjeta | "nueva" | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setTarjetas(await api.listar(incluirInactivas));
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setCargando(false);
    }
  }, [api, incluirInactivas]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const filtradas = filtrarTarjetas(tarjetas, busqueda);

  async function desactivar(t: Tarjeta) {
    if (!window.confirm(`¿Desactivar "${t.banco}${t.marca ? ` — ${t.marca}` : ""}"? Se puede reactivar luego.`)) return;
    try {
      await api.desactivar(t.id);
      await cargar();
    } catch (e) {
      setError(mensaje(e));
    }
  }

  async function exportar() {
    try {
      const todas = await api.listar(true);
      const blob = await exportarExcel([
        {
          nombre: "Medios de pago",
          columnas: [
            { titulo: "Banco", ancho: 22 },
            { titulo: "Tipo" },
            { titulo: "Marca" },
            { titulo: "Tasas por cuotas", ancho: 30 },
            { titulo: "Estado" },
          ],
          filas: todas.map((t) => [t.banco, etiquetaTipo(t.tipo), t.marca ?? "", etiquetaTasas(t), t.activo ? "Activa" : "Inactiva"]),
        },
      ]);
      await descargarBlob("medios-de-pago.xlsx", blob);
    } catch (e) {
      setError(mensaje(e));
    }
  }

  return (
    <div className="gestion">
      <div className="toolbar">
        <div className="searchbar searchbar--gestion">
          <input
            placeholder="Buscar por banco o marca…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={incluirInactivas}
            onChange={(e) => setIncluirInactivas(e.target.checked)}
          />
          Mostrar inactivas
        </label>
        <div className="spacer" />
        <button type="button" className="pill-btn" onClick={() => void exportar()}>
          Exportar
        </button>
        <button type="button" className="pill-btn pill-btn--primary" onClick={() => setEditando("nueva")}>
          + Nueva tarjeta
        </button>
      </div>

      {error !== null && <div className="error">{error}</div>}

      <div className="card">
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Banco</th>
                <th>Tipo</th>
                <th>Marca</th>
                <th>Tasas por cuotas</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cargando && (
                <tr>
                  <td colSpan={6} className="td-vacio">
                    Cargando tarjetas…
                  </td>
                </tr>
              )}
              {!cargando && filtradas.length === 0 && (
                <tr>
                  <td colSpan={6} className="td-vacio">
                    No hay tarjetas para mostrar.
                  </td>
                </tr>
              )}
              {!cargando &&
                filtradas.map((t) => (
                  <tr key={t.id} className={t.activo ? "" : "fila-inactiva"}>
                    <td className="strong">{t.banco}</td>
                    <td>{etiquetaTipo(t.tipo)}</td>
                    <td>{t.marca ?? <span className="muted">—</span>}</td>
                    <td>{etiquetaTasas(t) === "" ? <span className="muted">—</span> : etiquetaTasas(t)}</td>
                    <td>
                      {t.activo ? (
                        <span className="badge badge--ok">Activa</span>
                      ) : (
                        <span className="badge badge--n">Inactiva</span>
                      )}
                    </td>
                    <td className="acciones">
                      <button type="button" className="linkbtn" onClick={() => setEditando(t)}>
                        Editar
                      </button>
                      {t.activo && (
                        <button
                          type="button"
                          className="linkbtn linkbtn--danger"
                          onClick={() => void desactivar(t)}
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
        <ModalTarjeta
          api={api}
          tarjeta={editando === "nueva" ? null : editando}
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

function ModalTarjeta({
  api,
  tarjeta,
  onCerrar,
  onGuardado,
}: {
  api: ClienteMediosPago;
  tarjeta: Tarjeta | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [form, setForm] = useState<FormTarjeta>(() =>
    tarjeta === null ? FORM_TARJETA_VACIO : formDesdeTarjeta(tarjeta),
  );
  const [errores, setErrores] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  function campo<K extends keyof FormTarjeta>(clave: K, valor: FormTarjeta[K]) {
    setForm((f) => ({ ...f, [clave]: valor }));
  }

  function campoTasa(i: number, clave: "cuotas" | "porcentaje", valor: string) {
    setForm((f) => ({
      ...f,
      tasas: f.tasas.map((t, idx) => (idx === i ? { ...t, [clave]: valor } : t)),
    }));
  }

  function agregarTasa() {
    setForm((f) => ({ ...f, tasas: [...f.tasas, { ...TASA_VACIA }] }));
  }

  function quitarTasa(i: number) {
    setForm((f) => ({ ...f, tasas: f.tasas.filter((_, idx) => idx !== i) }));
  }

  async function guardar() {
    const e = validarTarjeta(form);
    if (e.length > 0) {
      setErrores(e);
      return;
    }
    setGuardando(true);
    setErrores([]);
    try {
      const datos = aDatosTarjeta(form);
      if (tarjeta === null) await api.crear(datos);
      else await api.actualizar(tarjeta.id, datos);
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
          <h3>{tarjeta === null ? "Nueva tarjeta" : `Editar — ${tarjeta.banco}`}</h3>
          <button type="button" className="modal__x" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className="modal__body">
          <div className="modal__row">
            <div className="field">
              <label>Banco</label>
              <input className="input" value={form.banco} onChange={(e) => campo("banco", e.target.value)} />
            </div>
            <div className="field">
              <label>Tipo</label>
              <select
                className="input"
                value={form.tipo}
                onChange={(e) => campo("tipo", e.target.value as FormTarjeta["tipo"])}
              >
                {TIPOS_TARJETA.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label>Marca (opcional)</label>
            <input
              className="input"
              placeholder="Visa, Mastercard…"
              value={form.marca}
              onChange={(e) => campo("marca", e.target.value)}
            />
          </div>

          <div className="section-title" style={{ marginTop: 14 }}>
            Tasas por cantidad de cuotas
          </div>
          {form.tasas.map((t, i) => (
            <div key={i} className="modal__row" style={{ alignItems: "flex-end" }}>
              <div className="field">
                <label>Cuotas</label>
                <input
                  className="input"
                  inputMode="numeric"
                  value={t.cuotas}
                  onChange={(e) => campoTasa(i, "cuotas", e.target.value)}
                />
              </div>
              <div className="field">
                <label>Recargo %</label>
                <input
                  className="input"
                  inputMode="decimal"
                  value={t.porcentaje}
                  onChange={(e) => campoTasa(i, "porcentaje", e.target.value)}
                />
              </div>
              <button
                type="button"
                className="pill-btn"
                onClick={() => quitarTasa(i)}
                disabled={form.tasas.length === 1}
                title={form.tasas.length === 1 ? "Debe quedar al menos una tasa" : "Quitar"}
              >
                Quitar
              </button>
            </div>
          ))}
          <button type="button" className="linkbtn" onClick={agregarTasa}>
            + Agregar cuota
          </button>

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
