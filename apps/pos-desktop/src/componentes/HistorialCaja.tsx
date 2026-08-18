/**
 * Fase 12: historial de arqueos de caja — turnos pasados (apertura, cierre,
 * fondo, contado, diferencia), con detalle completo al hacer click. El
 * backend ya lo tenía todo persistido (ADR-0026); esto es la pantalla que
 * faltaba para consumirlo.
 */
import { useCallback, useEffect, useState } from "react";

import { Money } from "@nexosoft/domain";

import { descargarBlob } from "../descargas";
import { exportarExcel } from "../exportar-excel";
import {
  ErrorCaja,
  type ClienteCaja,
  type TurnoCaja,
  type TurnoCajaResumen,
} from "../sync/cliente-caja";
import { pesos } from "../formato";
import { leerDiferencia } from "./caja-helpers";

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

function fechaHora(iso: string | null): string {
  if (iso === null) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function etiquetaDiferencia(diferencia: string | null): string {
  const dif = leerDiferencia(diferencia);
  if (dif === null) return "";
  return diferencia !== null && dif.signo !== "exacto" ? `${dif.etiqueta} · ${money(diferencia)}` : dif.etiqueta;
}

function BadgeDiferencia({ diferencia }: { diferencia: string | null }) {
  const dif = leerDiferencia(diferencia);
  if (dif === null) return <span className="muted">—</span>;
  const clase =
    dif.signo === "faltante"
      ? "badge badge--danger"
      : dif.signo === "sobrante"
        ? "badge badge--warn"
        : "badge badge--ok";
  return (
    <span className={clase}>
      {dif.etiqueta}
      {diferencia !== null && dif.signo !== "exacto" ? ` · ${money(diferencia)}` : ""}
    </span>
  );
}

export function HistorialCaja({ cliente }: { cliente: ClienteCaja }) {
  const [turnos, setTurnos] = useState<TurnoCajaResumen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detalleId, setDetalleId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setTurnos(await cliente.listarTurnos());
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setCargando(false);
    }
  }, [cliente]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function exportar() {
    try {
      const blob = await exportarExcel([
        {
          nombre: "Historial de caja",
          columnas: [
            { titulo: "Apertura", ancho: 18 },
            { titulo: "Cierre", ancho: 18 },
            { titulo: "Terminal" },
            { titulo: "Cajero", ancho: 24 },
            { titulo: "Fondo" },
            { titulo: "Contado" },
            { titulo: "Diferencia", ancho: 22 },
          ],
          filas: turnos.map((t) => [
            fechaHora(t.abiertoEn),
            fechaHora(t.cerradoEn),
            t.terminal.nombre,
            t.usuario.email,
            money(t.fondoApertura),
            t.montoContado !== null ? money(t.montoContado) : "",
            etiquetaDiferencia(t.diferencia),
          ]),
        },
      ]);
      descargarBlob("historial-caja.xlsx", blob);
    } catch (e) {
      setError(mensaje(e));
    }
  }

  if (cargando) return <div className="muted">Cargando historial…</div>;

  return (
    <div>
      <div className="toolbar">
        <div className="spacer" />
        <button type="button" className="pill-btn" onClick={() => void exportar()}>
          Exportar
        </button>
      </div>

      {error !== null && <div className="error">{error}</div>}

      <div className="card">
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Apertura</th>
                <th>Cierre</th>
                <th>Terminal</th>
                <th>Cajero</th>
                <th className="num">Fondo</th>
                <th className="num">Contado</th>
                <th>Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {turnos.length === 0 && (
                <tr>
                  <td colSpan={7} className="td-vacio">
                    Todavía no hay turnos de caja cerrados.
                  </td>
                </tr>
              )}
              {turnos.map((t) => (
                <tr key={t.id} onClick={() => setDetalleId(t.id)} style={{ cursor: "pointer" }}>
                  <td>{fechaHora(t.abiertoEn)}</td>
                  <td>{fechaHora(t.cerradoEn)}</td>
                  <td>{t.terminal.nombre}</td>
                  <td>{t.usuario.email}</td>
                  <td className="num">{money(t.fondoApertura)}</td>
                  <td className="num">{t.montoContado !== null ? money(t.montoContado) : "—"}</td>
                  <td>
                    <BadgeDiferencia diferencia={t.diferencia} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {detalleId !== null && (
        <DetalleTurno cliente={cliente} turnoId={detalleId} onCerrar={() => setDetalleId(null)} />
      )}
    </div>
  );
}

function DetalleTurno({
  cliente,
  turnoId,
  onCerrar,
}: {
  cliente: ClienteCaja;
  turnoId: string;
  onCerrar: () => void;
}) {
  const [turno, setTurno] = useState<TurnoCaja | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    cliente
      .obtenerTurno(turnoId)
      .then((t) => {
        if (vivo) setTurno(t);
      })
      .catch((e: unknown) => {
        if (vivo) setError(mensaje(e));
      });
    return () => {
      vivo = false;
    };
  }, [cliente, turnoId]);

  const r = turno?.resumen;

  return (
    <div className="modal modal--show" onClick={onCerrar}>
      <div className="modal__box" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h3>Detalle del turno</h3>
          <button type="button" className="modal__x" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className="modal__body">
          {error !== null && <div className="error">{error}</div>}
          {turno === null && error === null && <div className="muted">Cargando…</div>}
          {turno !== null && r !== undefined && (
            <>
              <div className="kv">
                <span>Apertura</span>
                <b>{fechaHora(turno.abiertoEn)}</b>
              </div>
              <div className="kv">
                <span>Cierre</span>
                <b>{fechaHora(turno.cerradoEn)}</b>
              </div>
              <div className="kv">
                <span>Fondo de apertura</span>
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
                <BadgeDiferencia diferencia={r.diferencia} />
              </div>
              {turno.observaciones !== null && turno.observaciones !== "" && (
                <div className="kv">
                  <span>Observaciones</span>
                  <b>{turno.observaciones}</b>
                </div>
              )}

              <div className="section-title" style={{ marginTop: 16 }}>
                Movimientos manuales
              </div>
              {turno.movimientos.length === 0 ? (
                <p className="muted">Sin ingresos ni egresos manuales en este turno.</p>
              ) : (
                <ul className="etiquetas-lista-seleccion">
                  {turno.movimientos.map((m) => (
                    <li key={m.id}>
                      <span>{m.concepto ?? (m.tipo === "INGRESO" ? "Ingreso" : "Egreso")}</span>
                      <b
                        style={{
                          color:
                            m.tipo === "INGRESO" ? "var(--ok-fuerte)" : "var(--peligro, #e5484d)",
                        }}
                      >
                        {m.tipo === "INGRESO" ? "+" : "−"}
                        {money(m.monto)}
                      </b>
                    </li>
                  ))}
                </ul>
              )}
            </>
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
