import { useState, type CSSProperties, type FormEvent } from "react";

import type { Credenciales } from "../sync/cliente-auth-http";

/** Pantalla de inicio de sesión (solo en la app Tauri). */
export function PantallaLogin({
  onLogin,
  onConfig,
  onModoDemo,
}: {
  onLogin: (c: Credenciales) => Promise<void>;
  onConfig?: () => void;
  /** Arranca el POS en modo demo autocontenido (sin backend). */
  onModoDemo?: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      await onLogin({ email: email.trim(), password });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCargando(false);
    }
  }

  const deshabilitado = cargando || email.trim() === "" || password === "";

  return (
    <div style={fondo}>
      <form style={tarjeta} onSubmit={enviar}>
        <div style={marca}>
          Nexo<span style={{ color: "#2563eb" }}>Soft</span> POS
        </div>
        <p style={subtitulo}>Iniciá sesión para abrir la caja</p>

        <label style={etiqueta}>
          Email
          <input
            style={campo}
            type="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="cajero@comercio.com"
          />
        </label>
        <label style={etiqueta}>
          Contraseña
          <input
            style={campo}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error !== null && <div style={aviso}>{error}</div>}

        <button type="submit" style={{ ...boton, opacity: deshabilitado ? 0.6 : 1 }} disabled={deshabilitado}>
          {cargando ? "Ingresando…" : "Ingresar"}
        </button>

        {onConfig !== undefined && (
          <button type="button" style={enlace} onClick={onConfig}>
            ⚙ Configuración del servidor
          </button>
        )}
        {onModoDemo !== undefined && (
          <button type="button" style={botonDemo} onClick={onModoDemo}>
            Probar en modo demo (sin conexión)
          </button>
        )}
      </form>
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
  gap: "0.9rem",
  padding: "2rem",
  background: "#fff",
  borderRadius: "12px",
  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.12)",
};
const marca: CSSProperties = { fontSize: "1.6rem", fontWeight: 700, color: "#0f172a" };
const subtitulo: CSSProperties = { margin: 0, color: "#64748b", fontSize: "0.9rem" };
const etiqueta: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.3rem",
  fontSize: "0.85rem",
  color: "#334155",
};
const campo: CSSProperties = {
  padding: "0.6rem 0.7rem",
  borderRadius: "8px",
  border: "1px solid #cbd5e1",
  fontSize: "1rem",
};
const boton: CSSProperties = {
  marginTop: "0.4rem",
  padding: "0.7rem",
  borderRadius: "8px",
  border: "none",
  background: "#2563eb",
  color: "#fff",
  fontSize: "1rem",
  fontWeight: 600,
  cursor: "pointer",
};
const aviso: CSSProperties = {
  background: "#fef2f2",
  color: "#b91c1c",
  padding: "0.5rem 0.7rem",
  borderRadius: "8px",
  fontSize: "0.85rem",
};
const enlace: CSSProperties = {
  marginTop: "0.2rem",
  background: "none",
  border: "none",
  color: "#2563eb",
  fontSize: "0.85rem",
  cursor: "pointer",
};
const botonDemo: CSSProperties = {
  marginTop: "0.2rem",
  padding: "0.6rem",
  borderRadius: "8px",
  border: "1px solid #1C97B0",
  background: "#fff",
  color: "#0f6b7d",
  fontSize: "0.9rem",
  fontWeight: 600,
  cursor: "pointer",
};
