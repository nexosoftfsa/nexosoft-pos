/**
 * Modal de gestión de la credencial de acceso por código de barras de un
 * usuario (Fase 15.A, ver ADR-0051). Solo ADMIN (mismo gate que `Usuarios.tsx`).
 * El payload que codifica el barcode se muestra e imprime una sola vez, al
 * regenerar — el backend nunca lo vuelve a exponer.
 */
import { useCallback, useEffect, useState } from "react";

import type { ClienteUsuarios, UsuarioRemoto } from "../sync/cliente-usuarios-http";
import {
  ErrorCredenciales,
  type ClienteCredenciales,
  type EstadoCredencial,
} from "../sync/cliente-credenciales-http";
import { ComprobanteCredencial } from "./ComprobanteCredencial";
import { useImpresionCredencial } from "./usar-impresion-credencial";

function mensaje(e: unknown): string {
  if (e instanceof ErrorCredenciales) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}

function fecha(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function CredencialEmpleado({
  usuario,
  clienteUsuarios,
  clienteCredenciales,
  comercio,
  onCerrar,
}: {
  usuario: UsuarioRemoto;
  clienteUsuarios: ClienteUsuarios;
  clienteCredenciales: ClienteCredenciales;
  /** Razón social/logo del comercio, para la credencial impresa. Sin esto (o sin cargar), muestra "Nexosoft" y su logo. */
  comercio?: { razonSocial: string; logoDataUrl?: string };
  onCerrar: () => void;
}) {
  const [estado, setEstado] = useState<EstadoCredencial | null>(null);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avisoNuevaCredencial, setAvisoNuevaCredencial] = useState(false);
  const { datosCredencial, imprimirCredencial } = useImpresionCredencial();

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setEstado(await clienteCredenciales.obtenerEstado(usuario.id));
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setCargando(false);
    }
  }, [clienteCredenciales, usuario.id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function generar() {
    setProcesando(true);
    setError(null);
    setAvisoNuevaCredencial(false);
    try {
      const { payload } = await clienteCredenciales.regenerar(usuario.id);
      const foto = await clienteUsuarios.obtenerFoto(usuario.id).catch(() => ({ fotoBase64: null }));
      const razonSocial = comercio?.razonSocial.trim();
      imprimirCredencial({
        nombreDisplay: usuario.nombreDisplay,
        rol: usuario.rol,
        payloadBarcode: payload,
        ...(foto.fotoBase64 !== null ? { fotoDataUrl: foto.fotoBase64 } : {}),
        ...(razonSocial !== undefined && razonSocial !== "" ? { razonSocial } : {}),
        ...(comercio?.logoDataUrl !== undefined ? { logoDataUrl: comercio.logoDataUrl } : {}),
      });
      setAvisoNuevaCredencial(true);
      await cargar();
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setProcesando(false);
    }
  }

  async function revocar() {
    if (!window.confirm(`¿Seguro que querés revocar la credencial de "${usuario.nombreDisplay}"? Ya no va a poder loguearse escaneándola.`)) {
      return;
    }
    setProcesando(true);
    setError(null);
    try {
      await clienteCredenciales.revocar(usuario.id);
      await cargar();
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setProcesando(false);
    }
  }

  return (
    <>
      <div className="modal modal--show" onClick={onCerrar}>
        <div className="modal__box" onClick={(e) => e.stopPropagation()}>
          <div className="modal__head">
            <h3>Credencial de {usuario.nombreDisplay}</h3>
            <button type="button" className="modal__x" onClick={onCerrar} aria-label="Cerrar">
              ×
            </button>
          </div>
          <div className="modal__body">
            {cargando && <div className="muted">Cargando…</div>}

            {!cargando && (
              <>
                {estado === null ? (
                  <div className="muted">Este usuario todavía no tiene una credencial generada.</div>
                ) : (
                  <div className="field" style={{ gap: "0.3rem" }}>
                    <div>
                      Estado:{" "}
                      {estado.activa ? (
                        <span className="badge badge--ok">Activa</span>
                      ) : (
                        <span className="badge badge--warn">Revocada</span>
                      )}
                    </div>
                    <div className="muted">Versión {estado.version} · emitida {fecha(estado.creadaEn)}</div>
                    {estado.ultimoUsoEn !== null && (
                      <div className="muted">Último uso: {fecha(estado.ultimoUsoEn)}</div>
                    )}
                  </div>
                )}

                {avisoNuevaCredencial && (
                  <div className="aviso-ok" style={{ marginTop: "0.6rem" }}>
                    Credencial generada e impresa. Guardala en un lugar seguro — por seguridad no
                    se puede volver a ver ni reimprimir el mismo código; si se pierde, generá una
                    nueva (invalida la anterior).
                  </div>
                )}
              </>
            )}

            {error !== null && <div className="error">{error}</div>}
          </div>
          <div className="modal__foot">
            {estado !== null && estado.activa && (
              <button type="button" className="pill-btn pill-btn--danger" onClick={() => void revocar()} disabled={procesando}>
                Revocar
              </button>
            )}
            <button
              type="button"
              className="pill-btn pill-btn--primary"
              onClick={() => void generar()}
              disabled={procesando || cargando}
            >
              {procesando ? "Generando…" : estado !== null ? "Regenerar e imprimir" : "Generar e imprimir"}
            </button>
          </div>
        </div>
      </div>
      {datosCredencial && <ComprobanteCredencial datos={datosCredencial} />}
    </>
  );
}
