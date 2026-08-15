import { useCallback, useEffect, useState, type CSSProperties } from "react";

import type { TerminalRemota } from "../sync/cliente-terminales-http";

/** Selección de la caja/terminal en la que está el cajero (solo Tauri). */
export function PantallaTerminal({
  listar,
  onElegir,
  crear,
}: {
  listar: () => Promise<TerminalRemota[]>;
  onElegir: (id: string, nombre: string) => Promise<void>;
  /** Si se pasa (ADMIN/SUPERVISOR), habilita el alta de una terminal nueva. */
  crear?: (nombre: string) => Promise<TerminalRemota>;
}) {
  const [terminales, setTerminales] = useState<TerminalRemota[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eligiendo, setEligiendo] = useState(false);
  const [nombreNueva, setNombreNueva] = useState("");
  const [creando, setCreando] = useState(false);

  const recargar = useCallback(() => {
    return listar()
      .then((ts) => setTerminales(ts))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [listar]);

  useEffect(() => {
    let activo = true;
    listar()
      .then((ts) => {
        if (activo) setTerminales(ts);
      })
      .catch((e: unknown) => {
        if (activo) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      activo = false;
    };
  }, [listar]);

  async function elegir(t: TerminalRemota) {
    setError(null);
    setEligiendo(true);
    try {
      await onElegir(t.id, t.nombre);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setEligiendo(false);
    }
  }

  async function crearNueva() {
    if (crear === undefined || nombreNueva.trim() === "") return;
    setError(null);
    setCreando(true);
    try {
      await crear(nombreNueva.trim());
      setNombreNueva("");
      await recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreando(false);
    }
  }

  return (
    <div style={fondo}>
      <div style={tarjeta}>
        <div style={titulo}>¿En qué caja estás?</div>

        {error !== null && <div style={aviso}>{error}</div>}

        {terminales === null && error === null && <p style={texto}>Cargando terminales…</p>}

        {terminales !== null && terminales.length === 0 && (
          <p style={texto}>No hay terminales registradas para esta sucursal.</p>
        )}

        {terminales?.map((t) => (
          <button key={t.id} type="button" style={opcion} disabled={eligiendo} onClick={() => void elegir(t)}>
            {t.nombre}
          </button>
        ))}

        {crear !== undefined && (
          <div style={filaNueva}>
            <input
              style={campo}
              placeholder="Nombre (ej. Depósito, Oficina)"
              value={nombreNueva}
              onChange={(e) => setNombreNueva(e.target.value)}
              disabled={creando}
            />
            <button
              type="button"
              style={botonNueva}
              disabled={creando || nombreNueva.trim() === ""}
              onClick={() => void crearNueva()}
            >
              {creando ? "…" : "+ Agregar"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const fondo: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100vh",
  background: "#f1f5f9",
  fontFamily: "system-ui, sans-serif",
};
const tarjeta: CSSProperties = {
  width: "min(360px, 90vw)",
  display: "flex",
  flexDirection: "column",
  gap: "0.7rem",
  padding: "2rem",
  background: "#fff",
  borderRadius: "12px",
  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.12)",
};
const titulo: CSSProperties = { fontSize: "1.2rem", fontWeight: 700, color: "#0f172a", marginBottom: "0.3rem" };
const texto: CSSProperties = { margin: 0, color: "#64748b", fontSize: "0.9rem" };
const opcion: CSSProperties = {
  padding: "0.8rem",
  borderRadius: "8px",
  border: "1px solid #cbd5e1",
  background: "#f8fafc",
  fontSize: "1rem",
  fontWeight: 600,
  color: "#0f172a",
  cursor: "pointer",
  textAlign: "left",
};
const aviso: CSSProperties = {
  background: "#fef2f2",
  color: "#b91c1c",
  padding: "0.5rem 0.7rem",
  borderRadius: "8px",
  fontSize: "0.85rem",
};
const filaNueva: CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  marginTop: "0.5rem",
  paddingTop: "0.7rem",
  borderTop: "1px dashed #cbd5e1",
};
const campo: CSSProperties = {
  flex: 1,
  padding: "0.55rem 0.7rem",
  borderRadius: "8px",
  border: "1px solid #cbd5e1",
  fontSize: "0.9rem",
};
const botonNueva: CSSProperties = {
  padding: "0.55rem 0.8rem",
  borderRadius: "8px",
  border: "none",
  background: "#2563eb",
  color: "#fff",
  fontSize: "0.85rem",
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
