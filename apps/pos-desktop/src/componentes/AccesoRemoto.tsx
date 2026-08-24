/**
 * Acceso remoto al panel de reportes (Fase 17.A, ADR-0055).
 *
 * Muestra la dirección pública fija del comercio
 * (`https://<comercio>.nexosoft.com.ar`) con un QR para engancharla desde el
 * celular en dos segundos, y dice si en este momento se ve desde afuera.
 *
 * El alta/baja del túnel solo se ofrece en la terminal que aloja el servidor
 * (igual criterio que "Actualizar servidor"): en Depósito u Oficina no hay
 * nada que activar.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { estaEnTauri } from "../datos/ejecutor-sql-tauri";
import { esServidorLocal } from "../datos/actualizar-servidor";
import {
  activarAccesoRemoto,
  desactivarAccesoRemoto,
  hostnameDelCodigo,
  reactivarAccesoRemoto,
  type ResultadoAccesoRemoto,
} from "../datos/acceso-remoto";
import {
  ClienteAccesoRemotoHttp,
  type EstadoAccesoRemoto,
} from "../sync/cliente-acceso-remoto-http";

export function AccesoRemoto({
  servidorUrl,
  obtenerToken,
}: {
  servidorUrl: string;
  obtenerToken: () => string | null;
}) {
  const [estado, setEstado] = useState<EstadoAccesoRemoto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoAccesoRemoto | null>(null);

  // En un ref y no en las dependencias: `obtenerToken` llega como arrow nueva
  // en cada render del padre, y si entrara en las deps de `refrescar` la
  // pantalla volvería a consultar el servidor en cada re-render.
  const tokenRef = useRef(obtenerToken);
  tokenRef.current = obtenerToken;

  const refrescar = useCallback(async () => {
    setError(null);
    // A Configuración se puede entrar desde el login, sin sesión: en ese caso
    // no hay a quién preguntarle todavía.
    if (tokenRef.current() === null) {
      setEstado(null);
      setError("Iniciá sesión como Administrador o Supervisor para ver el acceso remoto.");
      return;
    }
    try {
      setEstado(await new ClienteAccesoRemotoHttp(servidorUrl, () => tokenRef.current()).obtener());
    } catch (e) {
      setEstado(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [servidorUrl]);

  useEffect(() => {
    void refrescar();
  }, [refrescar]);

  // El QR se arma sobre la dirección pública: escanearlo con la cámara del
  // celular abre el panel sin tener que tipear nada.
  useEffect(() => {
    const url = estado?.url;
    if (url === undefined || url === null) {
      setQr(null);
      return;
    }
    let vivo = true;
    void import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(url, { width: 160, margin: 1 }))
      .then((dataUrl) => vivo && setQr(dataUrl))
      .catch(() => vivo && setQr(null));
    return () => {
      vivo = false;
    };
  }, [estado?.url]);

  async function correr(accion: () => Promise<ResultadoAccesoRemoto>) {
    setTrabajando(true);
    setResultado(null);
    try {
      const r = await accion();
      setResultado(r);
      if (r.ok) {
        setCodigo("");
        await refrescar();
      }
    } finally {
      setTrabajando(false);
    }
  }

  const esLaDelServidor = esServidorLocal(servidorUrl);
  const direccion = estado?.url ?? null;
  /** Dirección que trae el código tipeado, para mostrarla antes de activar. */
  const destinoDelCodigo = hostnameDelCodigo(codigo);
  const clavesDebiles = estado?.clavesDebiles ?? [];
  const yaExpuesto = estado?.estado === "activo";

  return (
    <div className="card card__pad">
      <div className="section-title">Acceso remoto al panel</div>

      {error !== null && <div className="error">{error}</div>}

      {/*
        Fase 17.C: con el panel en internet, la contraseña es lo único que
        separa a un desconocido de los datos del comercio. El aviso aparece
        ANTES de activar (que es cuando todavía se puede arreglar sin apuro) y
        también mientras está activo.
      */}
      {clavesDebiles.length > 0 && (
        <div
          style={{
            background: yaExpuesto ? "#fef2f2" : "#fffbeb",
            color: yaExpuesto ? "#b91c1c" : "#92400e",
            border: `1px solid ${yaExpuesto ? "#fecaca" : "#fde68a"}`,
            borderRadius: 8,
            padding: "0.6rem 0.7rem",
            fontSize: "0.85rem",
            marginBottom: "0.7rem",
          }}
        >
          <strong>
            {yaExpuesto
              ? "El panel está publicado en internet y hay contraseñas flojas."
              : "Antes de publicar el panel, conviene reforzar estas contraseñas."}
          </strong>
          <ul style={{ margin: "0.4rem 0 0", paddingLeft: "1.1rem" }}>
            {clavesDebiles.map((c) => (
              <li key={c.email}>
                <b>{c.email}</b> ({c.rol.toLowerCase()}): {c.motivo}
              </li>
            ))}
          </ul>
          <div style={{ marginTop: "0.4rem" }}>
            Se cambian en Usuarios, con el botón <b>Contraseña</b> de cada fila. Una contraseña de
            12 caracteres o más, que no tenga el nombre del comercio, alcanza. Este aviso se
            actualiza apenas la cambiás.
          </div>
        </div>
      )}

      {estado?.estado === "activo" && direccion !== null && (
        <>
          <p className="muted" style={{ marginTop: 2 }}>
            Desde cualquier lugar, con el celular o cualquier navegador:
          </p>
          <div style={{ display: "flex", gap: "0.9rem", alignItems: "center", flexWrap: "wrap" }}>
            {qr !== null && (
              <img
                src={qr}
                alt={`Código QR de ${direccion}`}
                style={{ width: 130, height: 130, borderRadius: 8, border: "1px solid #e2e8f0" }}
              />
            )}
            <div style={{ minWidth: 180 }}>
              <div style={{ fontWeight: 600, wordBreak: "break-all" }}>{direccion}</div>
              <div className="muted" style={{ fontSize: "0.8rem", marginTop: 2 }}>
                {estado.alcanzable === true && "Se está viendo bien desde afuera."}
                {estado.alcanzable === false &&
                  "Ahora mismo no responde desde afuera. Revisá que la PC tenga internet."}
                {estado.alcanzable === null && "Sin comprobar."}
              </div>
              <button
                type="button"
                className="linkbtn"
                onClick={() => void navigator.clipboard.writeText(direccion)}
              >
                Copiar dirección
              </button>
            </div>
          </div>
        </>
      )}

      {estado?.estado === "apagado" && (
        <p className="muted" style={{ marginTop: 2 }}>
          El acceso remoto está desactivado: el panel solo se ve desde la red del local.
        </p>
      )}

      {estado?.estado === "no-configurado" && (
        <p className="muted" style={{ marginTop: 2 }}>
          {esLaDelServidor
            ? "Todavía no está dado de alta. Pedinos el código de activación y pegalo acá abajo."
            : "No está dado de alta. Se configura en la PC que aloja el servidor."}
        </p>
      )}

      {estado?.mensaje != null && estado.mensaje !== "" && (
        <p className="muted" style={{ fontSize: "0.8rem" }}>
          {estado.mensaje}
        </p>
      )}

      {estaEnTauri() && esLaDelServidor && (
        <div style={{ marginTop: "0.8rem", paddingTop: "0.8rem", borderTop: "1px solid #e2e8f0" }}>
          {estado?.estado === "no-configurado" && (
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
              <input
                style={{
                  flex: 1,
                  minWidth: 200,
                  padding: "0.5rem 0.6rem",
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  fontSize: "0.85rem",
                }}
                placeholder="Código de activación"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
              />
              <button
                type="button"
                className="pill-btn pill-btn--primary"
                disabled={trabajando || codigo.trim() === ""}
                onClick={() => void correr(() => activarAccesoRemoto(codigo))}
              >
                {trabajando ? "Activando…" : "Activar"}
              </button>
            </div>
          )}
          {destinoDelCodigo !== null && (
            <p className="muted" style={{ fontSize: "0.8rem", marginTop: 4 }}>
              Va a quedar en https://{destinoDelCodigo}
            </p>
          )}

          {estado?.estado === "apagado" && (
            <button
              type="button"
              className="linkbtn"
              disabled={trabajando}
              onClick={() => void correr(reactivarAccesoRemoto)}
            >
              {trabajando ? "Activando…" : "Volver a activar"}
            </button>
          )}

          {estado?.estado === "activo" && (
            <button
              type="button"
              className="linkbtn"
              disabled={trabajando}
              onClick={() => void correr(desactivarAccesoRemoto)}
            >
              {trabajando ? "Desactivando…" : "Desactivar acceso remoto"}
            </button>
          )}

          <p className="muted" style={{ fontSize: "0.75rem", marginTop: 4 }}>
            Windows va a pedir permiso de administrador.
          </p>
        </div>
      )}

      {resultado !== null && resultado.detalle !== "" && (
        <div className={resultado.ok ? "muted" : "error"} style={{ marginTop: "0.5rem" }}>
          {resultado.detalle}
        </div>
      )}
    </div>
  );
}
