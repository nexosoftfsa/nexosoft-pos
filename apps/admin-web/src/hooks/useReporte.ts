import { useEffect, useState, type DependencyList } from "react";

export interface EstadoReporte<T> {
  datos: T | null;
  cargando: boolean;
  error: string | null;
}

/**
 * Carga datos de un reporte y expone estado de carga/error. Re-ejecuta cuando
 * cambian las `deps` (típicamente el rango de fechas). Cancela resultados
 * obsoletos si el componente se desmonta o las deps cambian a mitad.
 */
export function useReporte<T>(
  cargar: () => Promise<T>,
  deps: DependencyList,
): EstadoReporte<T> {
  const [estado, setEstado] = useState<EstadoReporte<T>>({
    datos: null,
    cargando: true,
    error: null,
  });

  useEffect(() => {
    let activo = true;
    setEstado((s) => ({ ...s, cargando: true, error: null }));
    cargar().then(
      (datos) => {
        if (activo) setEstado({ datos, cargando: false, error: null });
      },
      (err: unknown) => {
        if (activo) {
          setEstado({
            datos: null,
            cargando: false,
            error: err instanceof Error ? err.message : "Error desconocido",
          });
        }
      },
    );
    return () => {
      activo = false;
    };
    // Hook genérico: el llamador controla la reactividad vía `deps` (el rango).
    // `cargar` se recrea en cada render a propósito y NO debe ir en deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return estado;
}
