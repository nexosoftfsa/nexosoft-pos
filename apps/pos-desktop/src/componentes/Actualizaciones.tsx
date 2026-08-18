/**
 * Actualizaciones del POS (solo ADMIN, solo Tauri). El chequeo real vive en
 * `datos/actualizaciones.ts` — se dispara solo al iniciar la app; acá solo
 * se muestra el estado compartido y un botón para forzar un nuevo chequeo
 * si el automático no encontró nada o falló. Sin diálogos de confirmación:
 * "Instalar y reiniciar" actúa directo, igual que el banner del costado.
 */
import { useEffect, useState, useSyncExternalStore } from "react";

import { estaEnTauri } from "../datos/ejecutor-sql-tauri";
import {
  chequearYDescargarEnSilencio,
  instalarYReiniciar,
  leerEstadoActualizacion,
  suscribirseActualizacion,
} from "../datos/actualizaciones";

export function Actualizaciones() {
  const estado = useSyncExternalStore(suscribirseActualizacion, leerEstadoActualizacion);
  const [versionActual, setVersionActual] = useState<string | null>(null);

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

  if (!estaEnTauri()) return null;

  return (
    <div className="card card__pad" style={{ marginTop: "1rem" }}>
      <div className="section-title">Actualizaciones</div>
      <p className="muted" style={{ marginTop: 2 }}>
        Versión instalada: {versionActual ?? "…"}
      </p>

      {estado.fase === "inactivo" && (
        <>
          <p className="muted">Ya tenés la última versión.</p>
          <button type="button" className="linkbtn" onClick={() => void chequearYDescargarEnSilencio()}>
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
          <button type="button" className="pill-btn pill-btn--primary" onClick={() => void instalarYReiniciar()}>
            Instalar y reiniciar
          </button>
        </>
      )}
      {estado.fase === "error" && (
        <>
          <div className="error">{estado.mensaje}</div>
          <button type="button" className="linkbtn" onClick={() => void chequearYDescargarEnSilencio()}>
            Reintentar
          </button>
        </>
      )}
    </div>
  );
}
