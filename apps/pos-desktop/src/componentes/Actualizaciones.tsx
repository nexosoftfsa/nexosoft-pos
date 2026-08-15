/**
 * Buscar/instalar actualizaciones del POS (solo ADMIN, solo Tauri). Ver
 * `datos/actualizaciones.ts`. Instalar reinicia la app — se avisa antes.
 */
import { useState, type CSSProperties } from "react";

import { estaEnTauri } from "../datos/ejecutor-sql-tauri";
import {
  buscarActualizacion,
  instalarActualizacionYReiniciar,
  type InfoActualizacion,
  type ProgresoDescarga,
} from "../datos/actualizaciones";

const VERSION_ACTUAL = "0.1.0"; // mantener sincronizado con src-tauri/tauri.conf.json

type Estado =
  | { fase: "inicial" }
  | { fase: "buscando" }
  | { fase: "al-dia" }
  | { fase: "disponible"; info: InfoActualizacion }
  | { fase: "instalando"; progreso: ProgresoDescarga | null }
  | { fase: "error"; mensaje: string };

export function Actualizaciones() {
  const [estado, setEstado] = useState<Estado>({ fase: "inicial" });

  async function buscar() {
    setEstado({ fase: "buscando" });
    try {
      const info = await buscarActualizacion();
      setEstado(info === null ? { fase: "al-dia" } : { fase: "disponible", info });
    } catch (e) {
      setEstado({ fase: "error", mensaje: e instanceof Error ? e.message : String(e) });
    }
  }

  async function instalar() {
    if (!window.confirm("Se va a descargar e instalar la actualización, y la app se va a reiniciar. ¿Continuar?")) {
      return;
    }
    setEstado({ fase: "instalando", progreso: null });
    try {
      await instalarActualizacionYReiniciar((p) => setEstado({ fase: "instalando", progreso: p }));
      // No debería llegar acá: relaunch() cierra la app.
    } catch (e) {
      setEstado({ fase: "error", mensaje: e instanceof Error ? e.message : String(e) });
    }
  }

  if (!estaEnTauri()) return null;

  return (
    <div style={caja}>
      <div style={titulo}>Actualizaciones</div>
      <div style={version}>Versión instalada: {VERSION_ACTUAL}</div>

      {estado.fase === "inicial" && (
        <button type="button" style={boton} onClick={() => void buscar()}>
          Buscar actualizaciones
        </button>
      )}
      {estado.fase === "buscando" && <p style={texto}>Buscando…</p>}
      {estado.fase === "al-dia" && (
        <>
          <p style={texto}>Ya tenés la última versión.</p>
          <button type="button" style={enlace} onClick={() => void buscar()}>
            Volver a buscar
          </button>
        </>
      )}
      {estado.fase === "disponible" && (
        <>
          <p style={texto}>Hay una versión nueva: {estado.info.versionDisponible}</p>
          {estado.info.notas !== null && <p style={notas}>{estado.info.notas}</p>}
          <button type="button" style={boton} onClick={() => void instalar()}>
            Instalar y reiniciar
          </button>
        </>
      )}
      {estado.fase === "instalando" && (
        <p style={texto}>
          Instalando…
          {estado.progreso?.bytesTotales
            ? ` ${Math.round((estado.progreso.bytesDescargados / estado.progreso.bytesTotales) * 100)}%`
            : ""}
        </p>
      )}
      {estado.fase === "error" && (
        <>
          <div style={aviso}>{estado.mensaje}</div>
          <button type="button" style={enlace} onClick={() => void buscar()}>
            Reintentar
          </button>
        </>
      )}
    </div>
  );
}

const caja: CSSProperties = {
  marginTop: "1rem",
  padding: "0.9rem 1rem",
  borderRadius: "10px",
  border: "1px solid #e2e8f0",
  background: "#f8fafc",
};
const titulo: CSSProperties = { fontWeight: 700, fontSize: "0.95rem", color: "#0f172a", marginBottom: "0.2rem" };
const version: CSSProperties = { fontSize: "0.8rem", color: "#64748b", marginBottom: "0.6rem" };
const texto: CSSProperties = { fontSize: "0.85rem", color: "#334155", margin: "0.3rem 0" };
const notas: CSSProperties = { fontSize: "0.8rem", color: "#64748b", whiteSpace: "pre-wrap" };
const boton: CSSProperties = {
  padding: "0.5rem 0.9rem",
  borderRadius: "8px",
  border: "none",
  background: "#2563eb",
  color: "#fff",
  fontSize: "0.85rem",
  fontWeight: 600,
  cursor: "pointer",
};
const enlace: CSSProperties = {
  background: "none",
  border: "none",
  color: "#2563eb",
  fontSize: "0.8rem",
  cursor: "pointer",
  padding: 0,
};
const aviso: CSSProperties = {
  background: "#fef2f2",
  color: "#b91c1c",
  padding: "0.5rem 0.7rem",
  borderRadius: "8px",
  fontSize: "0.8rem",
  marginBottom: "0.4rem",
};
