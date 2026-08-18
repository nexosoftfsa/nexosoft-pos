/**
 * Pantalla de Cuentas Corrientes (Fase 7.5): clientes con su saldo, alta/edición,
 * venta a cuenta (cargo), cobro (pago) y estado de cuenta (ledger). Online contra
 * el módulo de clientes del cloud-api.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { Money } from "@nexosoft/domain";

import { descargarBlob } from "../descargas";
import { exportarExcel } from "../exportar-excel";
import {
  ErrorCtaCte,
  type Cliente,
  type ClienteConSaldo,
  type ClienteCtaCte,
  type EstadoCuenta,
} from "../sync/cliente-ctacte";
import { pesos } from "../formato";
import {
  aDatosCliente,
  CONDICIONES_IVA,
  etiquetaCondicion,
  FORM_CLIENTE_VACIO,
  formDesdeCliente,
  leerSaldo,
  normalizarImporte,
  validarCliente,
  type FormCliente,
} from "./ctacte-helpers";

function mensaje(e: unknown): string {
  if (e instanceof ErrorCtaCte) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}

function money(valor: string): string {
  try {
    return pesos(Money.desde(valor));
  } catch {
    return valor;
  }
}

function fecha(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

type Movimiento = { cliente: ClienteConSaldo; tipo: "CARGO" | "PAGO" };

export function CuentasCorrientes({ cliente: api }: { cliente: ClienteCtaCte }) {
  const [clientes, setClientes] = useState<ClienteConSaldo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [incluirInactivos, setIncluirInactivos] = useState(false);
  const [editando, setEditando] = useState<Cliente | "nuevo" | null>(null);
  const [movimiento, setMovimiento] = useState<Movimiento | null>(null);
  const [estadoDe, setEstadoDe] = useState<ClienteConSaldo | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setClientes(await api.listar(incluirInactivos));
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setCargando(false);
    }
  }, [api, incluirInactivos]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (q === "") return clientes;
    return clientes.filter((c) =>
      [c.nombre, c.documento ?? ""].some((v) => v.toLowerCase().includes(q)),
    );
  }, [clientes, busqueda]);

  async function desactivar(c: ClienteConSaldo) {
    if (!window.confirm(`¿Desactivar a "${c.nombre}"? Se puede reactivar luego.`)) return;
    try {
      await api.desactivar(c.id);
      await cargar();
    } catch (e) {
      setError(mensaje(e));
    }
  }

  async function exportar() {
    try {
      const todos = await api.listar(true);
      const blob = await exportarExcel(
        "Clientes",
        [
          { titulo: "Cliente", ancho: 28 },
          { titulo: "CUIT / DNI" },
          { titulo: "Condición IVA", ancho: 20 },
          { titulo: "Saldo" },
          { titulo: "Límite" },
          { titulo: "Estado" },
        ],
        todos.map((c) => [
          c.nombre,
          c.documento ?? "",
          etiquetaCondicion(c.condicionIva),
          money(c.saldo),
          c.limiteCredito === "0.00" || c.limiteCredito === "0" ? "" : money(c.limiteCredito),
          leerSaldo(c.saldo).etiqueta,
        ]),
      );
      descargarBlob("clientes.xlsx", blob);
    } catch (e) {
      setError(mensaje(e));
    }
  }

  return (
    <div className="gestion">
      <div className="toolbar">
        <div className="searchbar searchbar--gestion">
          <input
            placeholder="Buscar por nombre o documento…"
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
        <button type="button" className="pill-btn" onClick={() => void exportar()}>
          Exportar
        </button>
        <button type="button" className="pill-btn pill-btn--primary" onClick={() => setEditando("nuevo")}>
          + Nuevo cliente
        </button>
      </div>

      {error !== null && <div className="error">{error}</div>}

      <div className="card">
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>CUIT / DNI</th>
                <th>Condición IVA</th>
                <th className="num">Saldo</th>
                <th className="num">Límite</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cargando && (
                <tr>
                  <td colSpan={7} className="td-vacio">
                    Cargando clientes…
                  </td>
                </tr>
              )}
              {!cargando && filtrados.length === 0 && (
                <tr>
                  <td colSpan={7} className="td-vacio">
                    No hay clientes para mostrar.
                  </td>
                </tr>
              )}
              {!cargando &&
                filtrados.map((c) => {
                  const s = leerSaldo(c.saldo);
                  const sinLimite = c.limiteCredito === "0.00" || c.limiteCredito === "0";
                  return (
                    <tr key={c.id} className={c.activo ? "" : "fila-inactiva"}>
                      <td className="strong">{c.nombre}</td>
                      <td>{c.documento ?? <span className="muted">—</span>}</td>
                      <td>{etiquetaCondicion(c.condicionIva)}</td>
                      <td className="num strong">{money(c.saldo)}</td>
                      <td className="num">{sinLimite ? <span className="muted">—</span> : money(c.limiteCredito)}</td>
                      <td>
                        {s.estado === "debe" && <span className="badge badge--warn">Debe</span>}
                        {s.estado === "aldia" && <span className="badge badge--ok">Al día</span>}
                        {s.estado === "afavor" && <span className="badge badge--info">A favor</span>}
                      </td>
                      <td className="acciones">
                        <button type="button" className="linkbtn" onClick={() => setMovimiento({ cliente: c, tipo: "PAGO" })}>
                          Cobrar
                        </button>
                        <button type="button" className="linkbtn" onClick={() => setMovimiento({ cliente: c, tipo: "CARGO" })}>
                          Cargo
                        </button>
                        <button type="button" className="linkbtn" onClick={() => setEstadoDe(c)}>
                          Estado
                        </button>
                        <button type="button" className="linkbtn" onClick={() => setEditando(c)}>
                          Editar
                        </button>
                        {c.activo && (
                          <button type="button" className="linkbtn linkbtn--danger" onClick={() => void desactivar(c)}>
                            Baja
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {editando !== null && (
        <ModalCliente
          api={api}
          cliente={editando === "nuevo" ? null : editando}
          onCerrar={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null);
            void cargar();
          }}
        />
      )}

      {movimiento !== null && (
        <ModalMovimiento
          api={api}
          movimiento={movimiento}
          onCerrar={() => setMovimiento(null)}
          onHecho={() => {
            setMovimiento(null);
            void cargar();
          }}
        />
      )}

      {estadoDe !== null && (
        <ModalEstadoCuenta api={api} cliente={estadoDe} onCerrar={() => setEstadoDe(null)} />
      )}
    </div>
  );
}

function ModalCliente({
  api,
  cliente,
  onCerrar,
  onGuardado,
}: {
  api: ClienteCtaCte;
  cliente: Cliente | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [form, setForm] = useState<FormCliente>(() =>
    cliente === null ? FORM_CLIENTE_VACIO : formDesdeCliente(cliente),
  );
  const [errores, setErrores] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  function campo<K extends keyof FormCliente>(clave: K, valor: FormCliente[K]) {
    setForm((f) => ({ ...f, [clave]: valor }));
  }

  async function guardar() {
    const e = validarCliente(form);
    if (e.length > 0) {
      setErrores(e);
      return;
    }
    setGuardando(true);
    setErrores([]);
    try {
      const datos = aDatosCliente(form);
      if (cliente === null) await api.crear(datos);
      else await api.actualizar(cliente.id, datos);
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
          <h3>{cliente === null ? "Nuevo cliente" : `Editar — ${cliente.nombre}`}</h3>
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
              <label>CUIT / DNI</label>
              <input className="input" value={form.documento} onChange={(e) => campo("documento", e.target.value)} />
            </div>
            <div className="field">
              <label>Condición IVA</label>
              <select
                className="input"
                value={form.condicionIva}
                onChange={(e) => campo("condicionIva", e.target.value as FormCliente["condicionIva"])}
              >
                {CONDICIONES_IVA.map((c) => (
                  <option key={c.valor} value={c.valor}>
                    {c.etiqueta}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="modal__row">
            <div className="field">
              <label>Teléfono</label>
              <input className="input" value={form.telefono} onChange={(e) => campo("telefono", e.target.value)} />
            </div>
            <div className="field">
              <label>Límite de crédito (vacío = sin límite)</label>
              <input
                className="input"
                inputMode="decimal"
                value={form.limiteCredito}
                onChange={(e) => campo("limiteCredito", e.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label>Email</label>
            <input className="input" value={form.email} onChange={(e) => campo("email", e.target.value)} />
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

function ModalMovimiento({
  api,
  movimiento,
  onCerrar,
  onHecho,
}: {
  api: ClienteCtaCte;
  movimiento: Movimiento;
  onCerrar: () => void;
  onHecho: () => void;
}) {
  const [monto, setMonto] = useState("");
  const [concepto, setConcepto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const esCobro = movimiento.tipo === "PAGO";

  async function guardar() {
    const m = Number(normalizarImporte(monto));
    if (!Number.isFinite(m) || m <= 0) {
      setError("El monto debe ser mayor a cero.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const c = concepto.trim() === "" ? undefined : concepto.trim();
      if (esCobro) await api.registrarPago(movimiento.cliente.id, normalizarImporte(monto), c);
      else await api.registrarCargo(movimiento.cliente.id, normalizarImporte(monto), c);
      onHecho();
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="modal modal--show" onClick={onCerrar}>
      <div className="modal__box" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h3>
            {esCobro ? "Registrar cobro" : "Venta a cuenta (cargo)"} — {movimiento.cliente.nombre}
          </h3>
          <button type="button" className="modal__x" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className="modal__body">
          <div className="kv">
            <span>Saldo actual</span>
            <b>{money(movimiento.cliente.saldo)}</b>
          </div>
          <div className="field">
            <label>Monto</label>
            <input
              className="input"
              inputMode="decimal"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void guardar();
              }}
            />
          </div>
          <div className="field">
            <label>Concepto (opcional)</label>
            <input
              className="input"
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              placeholder={esCobro ? "Ej.: pago en efectivo" : "Ej.: mercadería"}
            />
          </div>
          {error !== null && <div className="error">{error}</div>}
        </div>
        <div className="modal__foot">
          <button type="button" className="pill-btn" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </button>
          <button type="button" className="pill-btn pill-btn--primary" onClick={() => void guardar()} disabled={guardando}>
            {guardando ? "Guardando…" : esCobro ? "Registrar cobro" : "Registrar cargo"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalEstadoCuenta({
  api,
  cliente,
  onCerrar,
}: {
  api: ClienteCtaCte;
  cliente: ClienteConSaldo;
  onCerrar: () => void;
}) {
  const [estado, setEstado] = useState<EstadoCuenta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    api
      .estadoCuenta(cliente.id)
      .then((e) => vivo && setEstado(e))
      .catch((e: unknown) => vivo && setError(mensaje(e)));
    return () => {
      vivo = false;
    };
  }, [api, cliente.id]);

  const saldo = estado?.cliente.saldo ?? cliente.saldo;
  const s = leerSaldo(saldo);

  return (
    <div className="modal modal--show" onClick={onCerrar}>
      <div className="modal__box" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h3>Estado de cuenta — {cliente.nombre}</h3>
          <button type="button" className="modal__x" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className="modal__body">
          <div className="kv">
            <span>Saldo</span>
            <b>
              {money(saldo)}{" "}
              <span
                className={
                  s.estado === "debe" ? "badge badge--warn" : s.estado === "afavor" ? "badge badge--info" : "badge badge--ok"
                }
              >
                {s.etiqueta}
              </span>
            </b>
          </div>
          {error !== null && <div className="error">{error}</div>}
          {error === null && estado === null && <div className="muted">Cargando…</div>}
          {estado !== null && estado.movimientos.length === 0 && (
            <div className="muted">Sin movimientos.</div>
          )}
          {estado !== null && estado.movimientos.length > 0 && (
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Concepto</th>
                    <th>Tipo</th>
                    <th className="num">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {estado.movimientos.map((m) => (
                    <tr key={m.id}>
                      <td>{fecha(m.creadoEn)}</td>
                      <td>{m.concepto ?? <span className="muted">—</span>}</td>
                      <td>{m.tipo === "CARGO" ? "Cargo" : "Pago"}</td>
                      <td
                        className="num strong"
                        style={{ color: m.tipo === "CARGO" ? "var(--peligro, #e5484d)" : "var(--ok-fuerte)" }}
                      >
                        {m.tipo === "CARGO" ? "+" : "−"}
                        {money(m.monto)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="modal__foot">
          <button type="button" className="pill-btn pill-btn--primary" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
