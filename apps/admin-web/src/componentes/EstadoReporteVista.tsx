import type { ReactNode } from "react";

/** Muestra carga/error/vacío de forma uniforme, o el contenido si hay datos. */
export function EstadoReporteVista({
  cargando,
  error,
  vacio,
  children,
}: {
  cargando: boolean;
  error: string | null;
  vacio: boolean;
  children: ReactNode;
}) {
  if (cargando) return <p className="estado estado--cargando">Cargando…</p>;
  if (error) return <p className="estado estado--error">{error}</p>;
  if (vacio) return <p className="estado estado--vacio">Sin datos en el período.</p>;
  return <>{children}</>;
}
