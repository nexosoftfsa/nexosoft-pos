/**
 * Pantalla de Caja y Tesorería (Fase 7.4): apertura de turno, panel de estado
 * (saldo teórico + desglose), ingresos/egresos de efectivo, movimientos del
 * turno y arqueo/cierre. Online contra el módulo de caja del cloud-api; el
 * `terminalId` viene de la sesión.
 */
import { useCallback, useEffect, useState } from "react";

import { Money } from "@nexosoft/domain";

import {
  ErrorCaja,
  type ClienteCaja,
  type TipoMovimientoCaja,
  type TurnoCaja,
} from "../sync/cliente-caja";
import { pesos } from "../formato";
import {
  importeNoNegativo,
  importePositivo,
  leerDiferencia,
  normalizarImporte,
} from "./caja-helpers";
import { HistorialCaja } from "./HistorialCaja";

function mensaje(e: unknown): string {
  if (e instanceof ErrorCaja) return e.message;
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

function hora(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

export function CajaPanel({
  cliente,
  terminalId,
  ventasSinSincronizar = 0,
}: {
  cliente: ClienteCaja;
  terminalId: string;
  /**
   * Cuántas ventas tiene la terminal sin subir. Se avisa antes del arqueo: el
   * saldo teórico sale de las ventas que están en el servidor, así que con
   * pendientes queda corto y el cierre da un sobrante que no es real.
   */
  ventasSinSincronizar?: number;
}) {
  const [turno, setTurno] = useState<TurnoCaja | null>(null);
  const [cierre, setCierre] = useState<TurnoCaja | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<null | TipoMovimientoCaja | "arqueo">(null);
  const [vista, setVista] = useState<"actual" | "historial">("actual");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setTurno(await cliente.turnoActual(terminalId));
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setCargando(false);
    }
  }, [cliente, terminalId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (cargando) {
    return (
      <div className="gestion">
        <div className="muted">Cargando caja…</div>
      </div>
    );
  }

  return (
    <div className="gestion">
      <div className="toolbar">
        <span className="seg">
          <button
            type="button"
            className={vista === "actual" ? "on" : ""}
            onClick={() => setVista("actual")}
          >
            Turno actual
          </button>
          <button
            type="button"
            className={vista === "historial" ? "on" : ""}
            onClick={() => setVista("historial")}
          >
            Historial
          </button>
        </span>
      </div>

      {vista === "historial" ? (
        <HistorialCaja cliente={cliente} />
      ) : (
        <>
          {error !== null && <div className="error">{error}</div>}

          {cierre !== null ? (
            <ResumenCierre turno={cierre} onCerrar={() => setCierre(null)} />
          ) : turno === null ? (
            <AbrirCaja cliente={cliente} terminalId={terminalId} onAbierto={(t) => setTurno(t)} />
          ) : (
            <PanelTurno
              turno={turno}
              onMover={(tipo) => setModal(tipo)}
              onArqueo={() => setModal("arqueo")}
            />
          )}

          {modal !== null && modal !== "arqueo" && turno !== null && (
            <ModalMovimiento
              cliente={cliente}
              turnoId={turno.id}
              tipo={modal}
              onCerrar={() => setModal(null)}
              onHecho={(t) => {
                setTurno(t);
                setModal(null);
              }}
            />
          )}

          {modal === "arqueo" && turno !== null && (
            <ModalArqueo
              cliente={cliente}
              turno={turno}
              ventasSinSincronizar={ventasSinSincronizar}
              onCerrar={() => setModal(null)}
              onCerrado={(t) => {
                setModal(null);
                setTurno(null);
                setCierre(t);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

function AbrirCaja({
  cliente,
  terminalId,
  onAbierto,
}: {
  cliente: ClienteCaja;
  terminalId: string;
  onAbierto: (t: TurnoCaja) => void;
}) {
  const [fondo, setFondo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [abriendo, setAbriendo] = useState(false);

  async function abrir() {
    if (!importeNoNegativo(fondo)) {
      setError("Ingresá un fondo de apertura válido (0 o más).");
      return;
    }
    setAbriendo(true);
    setError(null);
    try {
      onAbierto(await cliente.abrirTurno(terminalId, normalizarImporte(fondo)));
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setAbriendo(false);
    }
  }

  return (
    <div className="card card__pad caja-abrir">
      <div className="section-title" style={{ marginTop: 0 }}>
        Caja cerrada
      </div>
      <p className="muted">
        No hay un turno de caja abierto en esta terminal. Abrí uno para empezar.
      </p>
      <div className="field" style={{ maxWidth: 260 }}>
        <label>Fondo de apertura (efectivo inicial)</label>
        <input
          className="input"
          inputMode="decimal"
          placeholder="0,00"
          value={fondo}
          onChange={(e) => setFondo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void abrir();
          }}
        />
      </div>
      {error !== null && <div className="error">{error}</div>}
      <button
        type="button"
        className="pill-btn pill-btn--primary"
        onClick={() => void abrir()}
        disabled={abriendo}
      >
        {abriendo ? "Abriendo…" : "Abrir caja"}
      </button>
    </div>
  );
}

function PanelTurno({
  turno,
  onMover,
  onArqueo,
}: {
  turno: TurnoCaja;
  onMover: (tipo: TipoMovimientoCaja) => void;
  onArqueo: () => void;
}) {
  const r = turno.resumen;
  return (
    <div className="caja-grid">
      <div className="card card__pad">
        <div className="section-title" style={{ marginTop: 0 }}>
          Estado de caja
        </div>
        <span className="badge badge--ok">Turno abierto</span>
        <div className="kpi__val" style={{ margin: "14px 0 2px" }}>
          {money(r.saldoTeorico)}
        </div>
        <div className="muted">Saldo teórico en caja</div>
        <div style={{ marginTop: 16 }}>
          <div className="kv">
            <span>Apertura</span>
            <b>{money(r.fondoApertura)}</b>
          </div>
          <div className="kv">
            <span>Ventas en efectivo ({r.cantidadVentas})</span>
            <b>{money(r.ventasEfectivo)}</b>
          </div>
          <div className="kv">
            <span>Ingresos manuales</span>
            <b>{money(r.ingresos)}</b>
          </div>
          <div className="kv">
            <span>Egresos / pagos</span>
            <b>{money(r.egresos)}</b>
          </div>
        </div>
        <div style={{ display: "flex", gap: 9, marginTop: 16, flexWrap: "wrap" }}>
          <button type="button" className="pill-btn" onClick={() => onMover("INGRESO")}>
            Ingreso
          </button>
          <button type="button" className="pill-btn" onClick={() => onMover("EGRESO")}>
            Egreso
          </button>
          <button type="button" className="pill-btn pill-btn--primary" onClick={onArqueo}>
            Arqueo y cierre
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card__head">
          <h3>Movimientos del turno</h3>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Hora</th>
                <th>Concepto</th>
                <th>Tipo</th>
                <th className="num">Monto</th>
              </tr>
            </thead>
            <tbody>
              {turno.movimientos.length === 0 && (
                <tr>
                  <td colSpan={4} className="td-vacio">
                    Todavía no hay movimientos manuales en este turno.
                  </td>
                </tr>
              )}
              {turno.movimientos.map((m) => (
                <tr key={m.id}>
                  <td>{hora(m.creadoEn)}</td>
                  <td>{m.concepto ?? <span className="muted">—</span>}</td>
                  <td>{m.tipo === "INGRESO" ? "Ingreso" : "Egreso"}</td>
                  <td
                    className="num strong"
                    style={{
                      color: m.tipo === "INGRESO" ? "var(--ok-fuerte)" : "var(--peligro, #e5484d)",
                    }}
                  >
                    {m.tipo === "INGRESO" ? "+" : "−"}
                    {money(m.monto)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ModalMovimiento({
  cliente,
  turnoId,
  tipo,
  onCerrar,
  onHecho,
}: {
  cliente: ClienteCaja;
  turnoId: string;
  tipo: TipoMovimientoCaja;
  onCerrar: () => void;
  onHecho: (t: TurnoCaja) => void;
}) {
  const [monto, setMonto] = useState("");
  const [concepto, setConcepto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const esIngreso = tipo === "INGRESO";

  async function guardar() {
    if (!importePositivo(monto)) {
      setError("El monto debe ser mayor a cero.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      onHecho(
        await cliente.registrarMovimiento(
          turnoId,
          tipo,
          normalizarImporte(monto),
          concepto.trim() === "" ? undefined : concepto.trim(),
        ),
      );
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
          <h3>{esIngreso ? "Ingreso de efectivo" : "Egreso de efectivo"}</h3>
          <button type="button" className="modal__x" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className="modal__body">
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
              placeholder={esIngreso ? "Ej.: aporte de fondo" : "Ej.: pago a proveedor, retiro"}
            />
          </div>
          {error !== null && <div className="error">{error}</div>}
        </div>
        <div className="modal__foot">
          <button type="button" className="pill-btn" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </button>
          <button
            type="button"
            className="pill-btn pill-btn--primary"
            onClick={() => void guardar()}
            disabled={guardando}
          >
            {guardando ? "Guardando…" : "Registrar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalArqueo({
  cliente,
  turno,
  onCerrar,
  onCerrado,
  ventasSinSincronizar = 0,
}: {
  cliente: ClienteCaja;
  turno: TurnoCaja;
  onCerrar: () => void;
  onCerrado: (t: TurnoCaja) => void;
  /**
   * Ventas que la terminal todavía no subió. El saldo teórico sale de las
   * ventas que están EN EL SERVIDOR, así que mientras haya pendientes el
   * teórico está corto por ese monto y el arqueo va a dar un sobrante que no
   * es real. No se bloquea el cierre —a veces hay que cerrar igual— pero el
   * cajero tiene que verlo antes de firmar.
   */
  ventasSinSincronizar?: number;
}) {
  const [contado, setContado] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cerrando, setCerrando] = useState(false);

  const teorico = Number(turno.resumen.saldoTeorico);
  const diferenciaPreview = importeNoNegativo(contado)
    ? Number(normalizarImporte(contado)) - teorico
    : null;

  async function cerrar() {
    if (!importeNoNegativo(contado)) {
      setError("Ingresá el efectivo contado (0 o más).");
      return;
    }
    setCerrando(true);
    setError(null);
    try {
      onCerrado(
        await cliente.cerrarTurno(
          turno.id,
          normalizarImporte(contado),
          observaciones.trim() === "" ? undefined : observaciones.trim(),
          ventasSinSincronizar,
        ),
      );
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setCerrando(false);
    }
  }

  return (
    <div className="modal modal--show" onClick={onCerrar}>
      <div className="modal__box" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h3>Arqueo y cierre de caja</h3>
          <button type="button" className="modal__x" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className="modal__body">
          {ventasSinSincronizar > 0 && (
            <div className="aviso">
              Hay {ventasSinSincronizar}{" "}
              {ventasSinSincronizar === 1 ? "venta que todavía no subió" : "ventas que todavía no subieron"}{" "}
              al servidor. Esa plata está en el cajón pero <b>no</b> está sumada en el saldo teórico,
              así que el arqueo va a dar un sobrante que no es real. Si podés, esperá a que vuelva la
              conexión y cerrá después. Si tenés que cerrar igual, queda registrado por qué.
            </div>
          )}
          <div className="kv">
            <span>Saldo teórico</span>
            <b>{money(turno.resumen.saldoTeorico)}</b>
          </div>
          <div className="field">
            <label>Efectivo contado (arqueo)</label>
            <input
              className="input"
              inputMode="decimal"
              placeholder="0,00"
              value={contado}
              onChange={(e) => setContado(e.target.value)}
            />
          </div>
          {diferenciaPreview !== null && (
            <div className="kv">
              <span>Diferencia</span>
              <b
                style={{
                  color: diferenciaPreview < 0 ? "var(--peligro, #e5484d)" : "var(--ok-fuerte)",
                }}
              >
                {diferenciaPreview > 0 ? "+" : ""}
                {money(diferenciaPreview.toFixed(2))}
              </b>
            </div>
          )}
          <div className="field">
            <label>Observaciones (opcional)</label>
            <input
              className="input"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
            />
          </div>
          {error !== null && <div className="error">{error}</div>}
        </div>
        <div className="modal__foot">
          <button type="button" className="pill-btn" onClick={onCerrar} disabled={cerrando}>
            Cancelar
          </button>
          <button
            type="button"
            className="pill-btn pill-btn--primary"
            onClick={() => void cerrar()}
            disabled={cerrando}
          >
            {cerrando ? "Cerrando…" : "Cerrar caja"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResumenCierre({ turno, onCerrar }: { turno: TurnoCaja; onCerrar: () => void }) {
  const r = turno.resumen;
  const dif = leerDiferencia(r.diferencia);
  return (
    <div className="card card__pad caja-abrir">
      <div className="section-title" style={{ marginTop: 0 }}>
        Caja cerrada — arqueo
      </div>
      <div className="kv">
        <span>Saldo teórico</span>
        <b>{money(r.saldoTeorico)}</b>
      </div>
      <div className="kv">
        <span>Efectivo contado</span>
        <b>{r.montoContado !== null ? money(r.montoContado) : "—"}</b>
      </div>
      <div className="kv">
        <span>Diferencia</span>
        <b
          className={
            dif?.signo === "faltante"
              ? "badge badge--danger"
              : dif?.signo === "sobrante"
                ? "badge badge--warn"
                : "badge badge--ok"
          }
        >
          {dif?.etiqueta ?? "—"}
          {r.diferencia !== null && dif?.signo !== "exacto" ? ` · ${money(r.diferencia)}` : ""}
        </b>
      </div>
      {/* El arqueo se firmó contra un teórico incompleto: al cerrar faltaban
          ventas por subir. La diferencia de arriba NO se toca —es lo que se
          firmó— y acá se explica y se muestra la cuenta con todo ya cargado. */}
      {r.arqueoIncompleto === true && (
        <div className="aviso" style={{ marginTop: 12 }}>
          Al cerrar quedaban {r.ventasSinSincronizarAlCerrar}{" "}
          {r.ventasSinSincronizarAlCerrar === 1 ? "venta sin subir" : "ventas sin subir"} al
          servidor, así que el saldo teórico de ese momento estaba corto. Ya subieron: con todo
          cargado, la diferencia real es{" "}
          <b>
            {r.diferenciaRecalculada != null ? money(r.diferenciaRecalculada) : "—"}
          </b>
          . No fue un error del arqueo.
        </div>
      )}
      <button
        type="button"
        className="pill-btn pill-btn--primary"
        style={{ marginTop: 16 }}
        onClick={onCerrar}
      >
        Abrir nueva caja
      </button>
    </div>
  );
}
