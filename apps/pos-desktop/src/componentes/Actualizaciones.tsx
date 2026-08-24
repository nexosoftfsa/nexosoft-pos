/**
 * Actualizaciones del POS (solo ADMIN, solo Tauri). El chequeo real vive en
 * `datos/actualizaciones.ts` — se dispara solo al iniciar la app; acá solo
 * se muestra el estado compartido y un botón para forzar un nuevo chequeo
 * si el automático no encontró nada o falló. Sin diálogos de confirmación:
 * "Instalar y reiniciar" actúa directo, igual que el banner del costado.
 */
import { useEffect, useState, useSyncExternalStore } from "react";

import { estaEnTauri } from "../datos/ejecutor-sql-tauri";
import { consultarSalud, type EstadoSalud } from "../sync/cliente-salud-http";
import {
  chequearYDescargarEnSilencio,
  instalarYReiniciar,
  leerEstadoActualizacion,
  suscribirseActualizacion,
} from "../datos/actualizaciones";
import { actualizarServidor, esServidorLocal } from "../datos/actualizar-servidor";

/**
 * Qué mostrar como versión del servidor. Un servidor caído o viejo no puede
 * dejar la pantalla en "…" para siempre: se dice qué pasa.
 */
export function textoVersionServidor(salud: EstadoSalud | null): string {
  if (salud === null) return "…";
  switch (salud.tipo) {
    case "ok":
      // "dev" es lo que devuelve un servidor corriendo desde el repo, sin
      // publicar: en un comercio no debería aparecer nunca.
      return salud.salud.version === "dev"
        ? "sin versión (corriendo desde el código)"
        : salud.salud.version;
    case "sin-conexion":
      return "no responde";
    case "error":
      return salud.mensaje;
  }
}

export function Actualizaciones({ servidorUrl }: { servidorUrl?: string }) {
  const estado = useSyncExternalStore(suscribirseActualizacion, leerEstadoActualizacion);
  const [versionActual, setVersionActual] = useState<string | null>(null);
  const [salud, setSalud] = useState<EstadoSalud | null>(null);
  const [actualizandoServidor, setActualizandoServidor] = useState(false);
  const [resultadoServidor, setResultadoServidor] = useState<{
    ok: boolean;
    detalle: string;
  } | null>(null);

  useEffect(() => {
    if (!estaEnTauri()) return;
    let vivo = true;
    import("@tauri-apps/api/app")
      .then(({ getVersion }) => getVersion())
      .then((v) => vivo && setVersionActual(v))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  // Versión del servidor de sucursal (Fase 17.D). Se pide en cada apertura de
  // Configuración: sirve para ver de un vistazo si el servidor quedó atrasado
  // respecto del POS, que es lo que rompió una instalación real.
  useEffect(() => {
    if (servidorUrl === undefined || servidorUrl.trim() === "") return;
    let vivo = true;
    void consultarSalud(servidorUrl).then((r) => vivo && setSalud(r));
    return () => {
      vivo = false;
    };
  }, [servidorUrl, resultadoServidor]);

  async function onActualizarServidor() {
    const { ask } = await import("@tauri-apps/plugin-dialog");
    const confirma = await ask(
      "Esto va a traer el código nuevo, migrar la base de datos y reiniciar el servidor. " +
        "Puede tardar varios minutos y el servidor va a quedar sin responder un momento mientras reinicia. " +
        "Hacelo en un momento sin ventas activas. Windows va a pedir permiso de administrador.",
      { title: "¿Actualizar el servidor ahora?", kind: "warning" },
    );
    if (!confirma) return;
    setActualizandoServidor(true);
    setResultadoServidor(null);
    try {
      setResultadoServidor(await actualizarServidor());
    } finally {
      setActualizandoServidor(false);
    }
  }

  if (!estaEnTauri()) return null;

  return (
    <div className="card card__pad">
      <div className="section-title">Actualizaciones</div>
      <p className="muted" style={{ marginTop: 2 }}>
        POS: {versionActual ?? "…"}
        <br />
        Servidor: {textoVersionServidor(salud)}
      </p>

      {estado.fase === "inactivo" && (
        <>
          <p className="muted">Ya tenés la última versión.</p>
          <button
            type="button"
            className="linkbtn"
            onClick={() => void chequearYDescargarEnSilencio()}
          >
            Buscar actualizaciones
          </button>
        </>
      )}
      {estado.fase === "buscando" && <p className="muted">Buscando…</p>}
      {estado.fase === "descargando" && (
        <p className="muted">
          Descargando…
          {estado.progreso.bytesTotales
            ? ` ${Math.round((estado.progreso.bytesDescargados / estado.progreso.bytesTotales) * 100)}%`
            : ""}
        </p>
      )}
      {estado.fase === "lista" && (
        <>
          <p className="muted">Hay una versión nueva lista: {estado.info.versionDisponible}</p>
          {estado.info.notas !== null && <p className="muted">{estado.info.notas}</p>}
          <button
            type="button"
            className="pill-btn pill-btn--primary"
            onClick={() => void instalarYReiniciar()}
          >
            Instalar y reiniciar
          </button>
        </>
      )}
      {estado.fase === "error" && (
        <>
          <div className="error">{estado.mensaje}</div>
          <button
            type="button"
            className="linkbtn"
            onClick={() => void chequearYDescargarEnSilencio()}
          >
            Reintentar
          </button>
        </>
      )}

      {servidorUrl !== undefined && esServidorLocal(servidorUrl) && (
        <div style={{ marginTop: "1rem", paddingTop: "0.8rem", borderTop: "1px solid #e2e8f0" }}>
          <div className="section-title">Servidor de esta sucursal</div>
          <p className="muted" style={{ marginTop: 2 }}>
            Esta terminal aloja el servidor. Actualizarlo trae el código nuevo, migra la base y
            reinicia el servicio — hacelo con el negocio cerrado o sin ventas activas.
          </p>
          <button
            type="button"
            className="linkbtn"
            onClick={() => void onActualizarServidor()}
            disabled={actualizandoServidor}
          >
            {actualizandoServidor
              ? "Actualizando el servidor… (puede tardar varios minutos)"
              : "Actualizar servidor"}
          </button>
          {resultadoServidor !== null && (
            <div
              className={resultadoServidor.ok ? "muted" : "error"}
              style={{ marginTop: "0.5rem" }}
            >
              {resultadoServidor.detalle}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
