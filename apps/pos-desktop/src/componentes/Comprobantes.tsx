/**
 * Pantalla de Comprobantes (Fase 7.6): lista de facturas y notas de crédito del
 * servidor de sucursal, con anulación (emite NC) y reimpresión. Online contra el
 * módulo de ventas del cloud-api.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { Money } from "@nexosoft/domain";

import { ErrorVentas, type Comprobante, type ClienteVentas } from "../sync/cliente-ventas";
import { pesos } from "../formato";
import {
  esAnulable,
  esFiscal,
  esNotaCredito,
  etiquetaMedioPago,
  etiquetaTipoComprobante,
  numeroComprobante,
} from "./comprobantes-helpers";

function mensajeError(e: unknown): string {
  if (e instanceof ErrorVentas) return e.message;
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

function fechaHora(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function esDeHoy(iso: string): boolean {
  const d = new Date(iso);
  const hoy = new Date();
  return (
    d.getFullYear() === hoy.getFullYear() &&
    d.getMonth() === hoy.getMonth() &&
    d.getDate() === hoy.getDate()
  );
}

export function Comprobantes({ cliente }: { cliente: ClienteVentas }) {
  const [comprobantes, setComprobantes] = useState<Comprobante[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [soloHoy, setSoloHoy] = useState(true);
  const [reimprimir, setReimprimir] = useState<Comprobante | null>(null);
  const [anulando, setAnulando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setComprobantes(await cliente.historial());
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setCargando(false);
    }
  }, [cliente]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const filtrados = useMemo(
    () => (soloHoy ? comprobantes.filter((c) => esDeHoy(c.creadaEn)) : comprobantes),
    [comprobantes, soloHoy],
  );

  async function anular(c: Comprobante) {
    const consecuencia = esFiscal(c.tipoComprobante)
      ? "Se emitirá una Nota de Crédito."
      : "No es un comprobante fiscal: se anula directo, sin Nota de Crédito.";
    if (
      !window.confirm(
        `¿Anular ${etiquetaTipoComprobante(c.tipoComprobante)} ${numeroComprobante(c.numeroComprobante)}? ${consecuencia}`,
      )
    ) {
      return;
    }
    setAnulando(c.id);
    setError(null);
    setAviso(null);
    try {
      const r = await cliente.anular(c.id);
      setAviso(
        esFiscal(r.notaCredito.tipoComprobante)
          ? `Se emitió la ${etiquetaTipoComprobante(r.notaCredito.tipoComprobante)} ${numeroComprobante(r.notaCredito.numeroComprobante)}.`
          : "Comprobante anulado.",
      );
      await cargar();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setAnulando(null);
    }
  }

  return (
    <div className="gestion">
      <div className="toolbar">
        <span className="seg">
          <button type="button" className={soloHoy ? "on" : ""} onClick={() => setSoloHoy(true)}>
            Hoy
          </button>
          <button type="button" className={soloHoy ? "" : "on"} onClick={() => setSoloHoy(false)}>
            Todos
          </button>
        </span>
        <div className="spacer" />
        <span className="muted">«Anular» emite una Nota de Crédito</span>
      </div>

      {error !== null && <div className="error">{error}</div>}
      {aviso !== null && <div className="aviso-ok">{aviso}</div>}

      <div className="card">
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Comprobante</th>
                <th>Número</th>
                <th>Fecha</th>
                <th>Medio de pago</th>
                <th className="num">Total</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cargando && (
                <tr>
                  <td colSpan={7} className="td-vacio">
                    Cargando comprobantes…
                  </td>
                </tr>
              )}
              {!cargando && filtrados.length === 0 && (
                <tr>
                  <td colSpan={7} className="td-vacio">
                    No hay comprobantes para mostrar.
                  </td>
                </tr>
              )}
              {!cargando &&
                filtrados.map((c) => (
                  <tr key={c.id}>
                    <td className="strong">
                      {etiquetaTipoComprobante(c.tipoComprobante)}
                      {esNotaCredito(c.tipoComprobante) && <span className="badge badge--info" style={{ marginLeft: 8 }}>NC</span>}
                    </td>
                    <td>{numeroComprobante(c.numeroComprobante)}</td>
                    <td>{fechaHora(c.creadaEn)}</td>
                    <td>{etiquetaMedioPago(c.medioPago)}</td>
                    <td className="num strong">{money(c.total)}</td>
                    <td>
                      {c.estado === "ANULADA" ? (
                        <span className="badge badge--danger">Anulada</span>
                      ) : (
                        <span className="badge badge--ok">Emitida</span>
                      )}
                    </td>
                    <td className="acciones">
                      <button type="button" className="linkbtn" onClick={() => setReimprimir(c)}>
                        Reimprimir
                      </button>
                      {esAnulable(c) && (
                        <button
                          type="button"
                          className="linkbtn linkbtn--danger"
                          onClick={() => void anular(c)}
                          disabled={anulando === c.id}
                        >
                          {anulando === c.id ? "Anulando…" : "Anular"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {reimprimir !== null && <ModalReimpresion comprobante={reimprimir} onCerrar={() => setReimprimir(null)} />}
    </div>
  );
}

function ModalReimpresion({ comprobante, onCerrar }: { comprobante: Comprobante; onCerrar: () => void }) {
  return (
    <div className="overlay" onClick={onCerrar}>
      <div className="ticket" onClick={(e) => e.stopPropagation()}>
        <div className="ticket-titulo">{etiquetaTipoComprobante(comprobante.tipoComprobante)}</div>
        <div className="ticket-numero">{numeroComprobante(comprobante.numeroComprobante)}</div>
        {comprobante.cae !== null ? (
          <div className="ticket-cae">
            <span className="badge-ok">CAE {comprobante.cae}</span>
          </div>
        ) : (
          <div className="ticket-estado">Sin CAE</div>
        )}
        <ul className="ticket-items">
          {comprobante.items.map((it) => (
            <li key={it.id}>
              <span>
                {it.cantidad} × {it.producto?.nombre ?? it.producto?.codigo ?? "Ítem"}
              </span>
              <span>{money(it.subtotal)}</span>
            </li>
          ))}
        </ul>
        <div className="ticket-total">
          <span>TOTAL</span>
          <span>{money(comprobante.total)}</span>
        </div>
        {comprobante.pagos !== undefined && comprobante.pagos.length > 0 && (
          <ul className="ticket-pagos">
            {comprobante.pagos.map((p) => (
              <li key={p.id}>
                <span>{etiquetaMedioPago(p.medioPago)}</span>
                <span>{money(p.monto)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="ticket-acciones">
          <button onClick={() => window.print()}>Imprimir</button>
          <button className="primario" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
