import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useSesion } from "../auth/contexto-sesion";
import { ErrorApi } from "../api/cliente-http";

export function PantallaLogin() {
  const { login } = useSesion();
  const navegar = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function manejarSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      await login({ email, password });
      navegar("/", { replace: true });
    } catch (err) {
      if (err instanceof ErrorApi) {
        setError(err.message);
      } else {
        setError("No se pudo conectar con el servidor");
      }
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="login">
      <form className="login__caja" onSubmit={manejarSubmit}>
        <h1 className="login__marca">NexoSoft</h1>
        <p className="login__subtitulo">Panel de reportes</p>

        <label className="campo">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </label>

        <label className="campo">
          <span>Contraseña</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {error && <p className="login__error">{error}</p>}

        <button type="submit" className="boton" disabled={cargando}>
          {cargando ? "Ingresando…" : "Ingresar"}
        </button>

        <p className="login__nota">Solo para administradores y supervisores.</p>
      </form>
    </div>
  );
}

/** Vista que se muestra si un usuario sin rol autorizado logra autenticarse. */
export function SinAcceso() {
  const { sesion, logout } = useSesion();
  return (
    <div className="login">
      <div className="login__caja">
        <h1 className="login__marca">Sin acceso</h1>
        <p className="login__subtitulo">
          El usuario <strong>{sesion?.email}</strong> ({sesion?.rol}) no tiene
          permisos para ver reportes.
        </p>
        <button className="boton" onClick={logout}>
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
