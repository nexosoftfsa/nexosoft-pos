import { Navigate } from "react-router-dom";
import { type ReactNode } from "react";
import { useSesion } from "../auth/contexto-sesion";
import { tieneAccesoAReportes } from "../auth/token";
import { SinAcceso } from "./PantallaLogin";

/**
 * Envuelve las rutas privadas: exige sesión y rol con acceso a reportes.
 * Sin sesión → al login. Con sesión pero rol no autorizado → pantalla "sin acceso".
 * (La autorización real la impone el backend; esto es solo UX.)
 */
export function RutaProtegida({ children }: { children: ReactNode }) {
  const { sesion } = useSesion();

  if (!sesion) return <Navigate to="/login" replace />;
  if (!tieneAccesoAReportes(sesion.rol)) return <SinAcceso />;

  return <>{children}</>;
}
