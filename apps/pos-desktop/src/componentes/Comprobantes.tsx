/**
 * Pantalla de Comprobantes (Fase 7.6): lista de facturas y notas de crédito del
 * servidor de sucursal, con anulación (emite NC) y reimpresión. Online contra el
 * módulo de ventas del cloud-api.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { Money } from "@nexosoft/domain";
import type { ConfiguracionComercio } from "@nexosoft/app";

import { descargarBlob } from "../descargas";
import { exportarExcel } from "../exportar-excel";
import {
  ErrorVentas,
  type Comprobante,
  type ClienteVentas,
  type VerificacionArca,
} from "../sync/cliente-ventas";
import { pesos } from "../formato";
import { ComprobanteA4 } from "./ComprobanteA4";
import { ComprobanteTicket } from "./ComprobanteTicket";
import {
  avisoFiscal,
  datosTicketDeComprobante,
  esAnulable,
  esFiscal,
  esNotaCredito,
  etiquetaMedioPago,
  etiquetaTipoComprobante,
  numeroComprobante,
} from "./comprobantes-helpers";
import { useImpresionA4 } from "./usar-impresion-a4";
import { useImpresionTicket } from "./usar-impresion-ticket";

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

export function Comprobantes({
  cliente,
  config,
}: {
  cliente: ClienteVentas;
  config: ConfiguracionComercio;
}) {
  const [comprobantes, setComprobantes] = useState<Comprobante[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [soloHoy, setSoloHoy] = useState(true);
  const [reimprimir, setReimprimir] = useState<Comprobante | null>(null);
  const [anulando, setAnulando] = useState<string | null>(null);
  const [verificando, setVerificando] = useState<string | null>(null);
  const [verificacion, setVerificacion] = useState<VerificacionArca | null>(null);
  const [motivo, setMotivo] = useState<{ titulo: string; texto: string } | null>(null);

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

  /**
   * Le pregunta a ARCA qué tiene registrado de este comprobante.
   *
   * Es de sólo lectura y no toca la venta. Existe porque en homologación el
   * comprobante no aparece en ninguna página pública de ARCA, así que era la
   * única forma de confirmar que ARCA lo hubiera registrado.
   */
  async function verificar(c: Comprobante) {
    setVerificando(c.id);
    setVerificacion(null);
    try {
      setVerificacion(await cliente.verificarEnArca(c.id));
    } catch (e) {
      // Que falle la consulta no dice nada del comprobante: puede estar bien y
      // ser ARCA (o la red) lo que no responde.
      setVerificacion({
        estado: "NO_SE_PUDO",
        mensaje: mensajeError(e),
        diferencias: [],
      });
    } finally {
      setVerificando(null);
    }
  }

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

  async function exportar() {
    try {
      const blob = await exportarExcel([
        {
          nombre: "Comprobantes",
          columnas: [
            { titulo: "Comprobante", ancho: 22 },
            { titulo: "Número" },
            { titulo: "Fecha" },
            { titulo: "Medio de pago", ancho: 20 },
            { titulo: "Total" },
            { titulo: "Estado" },
          ],
          filas: comprobantes.map((c) => [
            etiquetaTipoComprobante(c.tipoComprobante),
            numeroComprobante(c.numeroComprobante),
            fechaHora(c.creadaEn),
            etiquetaMedioPago(c.medioPago),
            money(c.total),
            c.estado === "ANULADA" ? "Anulada" : "Emitida",
          ]),
        },
      ]);
      await descargarBlob("comprobantes.xlsx", blob);
    } catch (e) {
      setError(mensajeError(e));
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
        <button type="button" className="pill-btn" onClick={() => void exportar()}>
          Exportar
        </button>
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
                      {/* Si ARCA no autorizó, se muestra: enterarse en una
                          inspección sale mucho más caro.

                          Es un BOTÓN y no sólo un tooltip: el motivo es el
                          dato que hace falta para arreglar el problema, y
                          colgado de un `title` no se puede leer entero ni
                          copiar. Cada vez que algo falló en un cliente, ese
                          texto fue lo primero que hubo que pedir y lo más
                          difícil de conseguir. */}
                      {(() => {
                        const aviso = avisoFiscal(c.estadoFiscal, c.motivoFiscal);
                        return aviso === null ? null : (
                          <button
                            type="button"
                            className={`badge badge--${aviso.tono} badge--boton`}
                            style={{ marginLeft: 6 }}
                            title="Ver el motivo"
                            onClick={() => setMotivo({ titulo: aviso.etiqueta, texto: aviso.detalle })}
                          >
                            {aviso.etiqueta}
                          </button>
                        );
                      })()}
                    </td>
                    <td className="acciones">
                      <button type="button" className="linkbtn" onClick={() => setReimprimir(c)}>
                        Reimprimir
                      </button>
                      {/* También sin CAE: ahí es cuando más falta hace saber
                          qué tiene ARCA. Preguntar por uno que quedó pendiente
                          es información útil —"ARCA no lo tiene" confirma que
                          no se emitió—, y era la respuesta que no había forma
                          de conseguir. */}
                      {esFiscal(c.tipoComprobante) && c.numeroComprobante !== null && (
                        <button
                          type="button"
                          className="linkbtn"
                          onClick={() => void verificar(c)}
                          disabled={verificando === c.id}
                        >
                          {verificando === c.id ? "Consultando…" : "Verificar en ARCA"}
                        </button>
                      )}
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

      {reimprimir !== null && (
        <ModalReimpresion comprobante={reimprimir} config={config} onCerrar={() => setReimprimir(null)} />
      )}

      {verificacion !== null && (
        <ResultadoVerificacion
          verificacion={verificacion}
          onCerrar={() => setVerificacion(null)}
        />
      )}

      {motivo !== null && (
        <div className="overlay" onClick={() => setMotivo(null)}>
          <div className="sync-detalle" onClick={(e) => e.stopPropagation()}>
            <h3>{motivo.titulo}</h3>
            {/* Seleccionable a propósito: esto se copia y se manda. */}
            <p className="sync-detalle-error" style={{ userSelect: "text" }}>
              {motivo.texto}
            </p>
            <div className="sync-detalle-acciones">
              <button
                className="primario"
                onClick={() => void navigator.clipboard.writeText(motivo.texto).catch(() => {})}
              >
                Copiar el motivo
              </button>
              <button onClick={() => setMotivo(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Cómo se pinta cada respuesta de ARCA. */
const TONO_VERIFICACION: Record<VerificacionArca["estado"], { clase: string; titulo: string }> = {
  AUTORIZADO: { clase: "badge--ok", titulo: "ARCA lo tiene registrado" },
  DIFIERE: { clase: "badge--danger", titulo: "ARCA lo tiene, pero con otros datos" },
  NO_ESTA: { clase: "badge--warn", titulo: "ARCA no lo tiene" },
  NO_APLICA: { clase: "badge--warn", titulo: "No es un comprobante fiscal" },
  NO_SE_PUDO: { clase: "badge--warn", titulo: "No se pudo consultar" },
};

function ResultadoVerificacion({
  verificacion,
  onCerrar,
}: {
  verificacion: VerificacionArca;
  onCerrar: () => void;
}) {
  const tono = TONO_VERIFICACION[verificacion.estado];
  return (
    <div className="overlay" onClick={onCerrar}>
      <div className="sync-detalle" onClick={(e) => e.stopPropagation()}>
        <h3>{tono.titulo}</h3>
        <p className="sync-detalle-ayuda">{verificacion.mensaje}</p>

        {verificacion.diferencias.length > 0 && (
          <ul className="sync-detalle-lista">
            {verificacion.diferencias.map((d) => (
              <li key={d}>
                <div className="sync-detalle-error">{d}</div>
              </li>
            ))}
          </ul>
        )}

        {verificacion.enArca !== undefined && (
          <div className="config-ayuda">
            <div>
              <strong>Lo que tiene ARCA</strong>
            </div>
            <div>CAE {verificacion.enArca.cae}</div>
            <div>
              Vence el {new Date(verificacion.enArca.caeFechaVto).toLocaleDateString("es-AR")}
            </div>
            {verificacion.enArca.importeTotal !== undefined && (
              <div>Total {money(verificacion.enArca.importeTotal)}</div>
            )}
          </div>
        )}

        <div className="sync-detalle-acciones">
          <button className="primario" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalReimpresion({
  comprobante,
  config,
  onCerrar,
}: {
  comprobante: Comprobante;
  config: ConfiguracionComercio;
  onCerrar: () => void;
}) {
  const { datosA4, imprimirA4 } = useImpresionA4();
  const { datosTicket, imprimirTicketPreview } = useImpresionTicket();
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
          <button onClick={() => void imprimirTicketPreview(datosTicketDeComprobante(comprobante, config))}>
            Imprimir
          </button>
          <button onClick={() => void imprimirA4(datosTicketDeComprobante(comprobante, config))}>
            Imprimir A4
          </button>
          <button className="primario" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
      </div>
      {datosA4 && <ComprobanteA4 datos={datosA4} />}
      {datosTicket && <ComprobanteTicket datos={datosTicket} />}
    </div>
  );
}
