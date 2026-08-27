/**
 * Certificado de facturación electrónica de ARCA (Fase 18).
 *
 * Para que ARCA autorice comprobantes (el CAE), el comercio necesita un
 * certificado a su nombre. Conseguirlo tiene una parte que puede hacer el
 * sistema y una que no:
 *
 *  - La clave privada y el pedido (CSR) los genera el servidor. Nadie tiene
 *    que instalar openssl ni tipear un "subject", que es donde falla todo el
 *    mundo: ARCA exige `serialNumber=CUIT <11 dígitos>` sin guiones, y si está
 *    mal el certificado se emite igual y recién no anda al facturar.
 *  - El trámite en ARCA lo hace el comercio con su Clave Fiscal. No hay API:
 *    es un formulario web. Automatizarlo obligaría a guardar la clave fiscal
 *    de cada cliente, y eso no se hace.
 *
 * Esta pantalla acompaña los tres pasos y verifica cada uno, para que el
 * comercio no descubra que algo faltaba recién cuando quiere vender.
 */
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";

import { descargarBlob } from "../descargas";
import {
  ClienteCertificadoArcaHttp,
  ErrorFiscalHttp,
  type CsrGenerado,
  type EstadoCertificado,
} from "../sync/cliente-fiscal-http";

const AYUDA_HOMOLOGACION = "https://wsass-homo.afip.gob.ar/wsass/portal/main.aspx";
const AYUDA_PRODUCCION = "https://serviciosweb.afip.gob.ar/clavefiscal/adminrel/agregarCertificado.aspx";

/**
 * El POS se actualiza antes que el servidor (el servidor lo hace solo, de
 * madrugada), así que hay una ventana en la que la app conoce endpoints que el
 * servidor todavía no tiene. Nest contesta "Cannot GET /..." con 404, que no
 * le dice nada a nadie.
 */
function mensaje(e: unknown): string {
  if (e instanceof ErrorFiscalHttp) {
    if (e.status === 404 && e.message.startsWith("Cannot ")) {
      return "El servidor de esta sucursal todavía no tiene esta función. Se actualiza solo esta madrugada; si no podés esperar, usá 'Actualizar servidor' más abajo.";
    }
    return e.message;
  }
  if (e instanceof Error) return e.message;
  return String(e);
}

function fecha(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("es-AR");
}

/**
 * El CN del certificado: el nombre con el que ARCA lo identifica.
 *
 * Hay que mostrarlo sí o sí. En ARCA, el permiso para facturar se le da a UN
 * certificado, no al CUIT: si el comercio autoriza otro (por ejemplo uno que
 * generó antes por su cuenta), este sigue sin permiso y el rechazo llega
 * después, sin decir que el problema es ése. Con el nombre a la vista se
 * puede comparar contra lo que dice la pantalla de ARCA.
 */
export function nombreDelCertificado(subject: string): string | null {
  const m = /CN=([^,]+)/.exec(subject);
  return m?.[1]?.trim() ?? null;
}

export function CertificadoArca({
  servidorUrl,
  cuit,
  razonSocial,
  obtenerToken,
}: {
  servidorUrl: string;
  cuit: string;
  razonSocial: string;
  obtenerToken: () => string | null;
}) {
  const [estado, setEstado] = useState<EstadoCertificado | null>(null);
  const [csr, setCsr] = useState<CsrGenerado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  // Mismo patrón que AccesoRemoto y Usuarios: el token llega como arrow nueva
  // en cada render, así que no puede estar en las dependencias del efecto.
  const tokenRef = useRef(obtenerToken);
  tokenRef.current = obtenerToken;

  const cargar = useCallback(async () => {
    if (cuit.trim() === "") return;
    try {
      const cliente = new ClienteCertificadoArcaHttp(servidorUrl, () => tokenRef.current());
      setEstado(await cliente.estado(cuit));
      setError(null);
    } catch (e) {
      setError(mensaje(e));
    }
  }, [servidorUrl, cuit]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function generar(forzar: boolean) {
    if (
      forzar &&
      !window.confirm(
        "Si generás un pedido nuevo, el certificado que ARCA haya emitido para el anterior deja de servir y hay que hacer el trámite otra vez. ¿Seguís?",
      )
    ) {
      return;
    }
    setTrabajando(true);
    setError(null);
    setAviso(null);
    try {
      const cliente = new ClienteCertificadoArcaHttp(servidorUrl, () => tokenRef.current());
      const r = await cliente.generarCsr({ cuit, razonSocial, alias: aliasSugerido(razonSocial), forzar });
      setCsr(r);
      await cargar();
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setTrabajando(false);
    }
  }

  async function guardarCsr() {
    if (csr === null) return;
    await descargarBlob("pedido-certificado-arca.csr", new Blob([csr.csrPem], { type: "text/plain" }));
  }

  async function subirCertificado(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setTrabajando(true);
    setError(null);
    setAviso(null);
    try {
      const texto = await archivo.text();
      const cliente = new ClienteCertificadoArcaHttp(servidorUrl, () => tokenRef.current());
      const datos = await cliente.subirCertificado(cuit, texto);
      setAviso(`Certificado guardado. Vence el ${fecha(datos.validoHasta)}.`);
      setCsr(null);
      await cargar();
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setTrabajando(false);
    }
  }

  if (cuit.trim() === "" || razonSocial.trim() === "") {
    return (
      <div className="card card__pad">
        <div className="section-title">Facturación electrónica (ARCA)</div>
        <p className="muted" style={{ margin: 0 }}>
          Completá primero la razón social y el CUIT del comercio, acá arriba. Con esos datos se
          arma el pedido de certificado.
        </p>
      </div>
    );
  }

  const listo = estado?.tieneCertificado === true;

  return (
    <div className="card card__pad">
      <div className="section-title">Facturación electrónica (ARCA)</div>

      {error !== null && <div className="error">{error}</div>}
      {aviso !== null && <div className="aviso-ok">{aviso}</div>}

      {listo && estado?.certificado ? (
        <>
          <p className="muted" style={{ marginTop: 2 }}>
            Certificado cargado, a nombre del CUIT {estado.certificado.cuit ?? cuit}.
            <br />
            Vence el <b>{fecha(estado.certificado.validoHasta)}</b>
            {estado.diasParaVencer !== null && ` (faltan ${estado.diasParaVencer} días)`}.
          </p>
          <div className="config-ayuda">
            Nombre del certificado en ARCA:{" "}
            <b style={{ fontFamily: "monospace" }}>
              {nombreDelCertificado(estado.certificado.subject) ?? "(sin nombre)"}
            </b>
            <br />
            Comprobá que sea <b>exactamente este</b> el que autorizaste en ARCA para Facturación
            Electrónica. El permiso se le da a un certificado puntual, no al CUIT: si autorizaste
            otro, los comprobantes se van a rechazar y el error no va a decir por qué.
          </div>
          {estado.diasParaVencer !== null && estado.diasParaVencer < 30 && (
            <div className="config-ayuda">
              Está por vencer. Hay que sacar uno nuevo en ARCA antes de esa fecha, o el comercio
              deja de poder facturar.
            </div>
          )}
          <button
            type="button"
            className="linkbtn"
            disabled={trabajando}
            onClick={() => void generar(true)}
          >
            Generar un pedido nuevo (renovación)
          </button>
        </>
      ) : (
        <>
          <p className="muted" style={{ marginTop: 2 }}>
            Sin esto el sistema vende con ticket interno, sin CAE. Son tres pasos y se hacen una
            sola vez.
          </p>

          <ol style={{ paddingLeft: "1.1rem", margin: "0.6rem 0", fontSize: "0.9rem" }}>
            <li style={{ marginBottom: "0.6rem" }}>
              <b>Generar el pedido acá.</b> Lo arma el servidor con los datos del comercio.
              <div style={{ marginTop: "0.35rem" }}>
                <button
                  type="button"
                  className="pill-btn"
                  disabled={trabajando}
                  onClick={() => void generar(estado?.tieneClave === true)}
                >
                  {trabajando
                    ? "Generando…"
                    : estado?.tieneClave === true
                      ? "Generar de nuevo"
                      : "Generar pedido"}
                </button>
                {csr !== null && (
                  <button
                    type="button"
                    className="pill-btn pill-btn--primary"
                    style={{ marginLeft: 8 }}
                    onClick={() => void guardarCsr()}
                  >
                    Guardar archivo .csr
                  </button>
                )}
              </div>
              {csr !== null && (
                <div className="config-ayuda" style={{ marginTop: "0.4rem" }}>
                  Pedido generado. Guardá el archivo y subilo a ARCA en el paso 2.
                  <br />
                  <span style={{ fontFamily: "monospace", fontSize: "0.78rem" }}>{csr.subject}</span>
                </div>
              )}
              {csr === null && estado?.tieneClave === true && (
                <div className="config-ayuda" style={{ marginTop: "0.4rem" }}>
                  Ya hay un pedido generado en esta PC, en <code>{estado.carpeta}</code>. Si lo
                  perdiste, generá uno nuevo — pero ojo: invalida el certificado que ARCA haya
                  emitido para el anterior.
                </div>
              )}
            </li>

            <li style={{ marginBottom: "0.6rem" }}>
              <b>Subirlo a ARCA</b> con la Clave Fiscal del comercio, y descargar el certificado
              que devuelve.
              <div className="config-ayuda" style={{ marginTop: "0.4rem" }}>
                Para producción: <code>{AYUDA_PRODUCCION}</code>
                <br />
                Para probar (homologación) es otro portal: <code>{AYUDA_HOMOLOGACION}</code>
                <br />
                Después, en <b>Administrador de Relaciones</b>, hay que asociar el servicio de
                Facturación Electrónica a ese certificado. Sin ese paso ARCA rechaza los
                comprobantes sin decir que falta.
              </div>
            </li>

            <li>
              <b>Cargar acá el certificado</b> que descargaste (archivo .crt o .pem).
              <div style={{ marginTop: "0.35rem" }}>
                <input
                  className="input"
                  type="file"
                  accept=".crt,.pem,.cer,text/plain"
                  disabled={trabajando || estado?.tieneClave !== true}
                  onChange={(ev) => void subirCertificado(ev)}
                />
              </div>
            </li>
          </ol>
        </>
      )}
    </div>
  );
}

/** Alias con el que se identifica el sistema ante ARCA. */
function aliasSugerido(razonSocial: string): string {
  const base = razonSocial.trim().split(/\s+/).slice(0, 3).join("-");
  return `NexoSoft-${base}`;
}
