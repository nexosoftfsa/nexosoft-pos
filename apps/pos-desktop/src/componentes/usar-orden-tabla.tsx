/**
 * Ordenar una tabla haciendo click en el encabezado de columna (Fase 12.F).
 * La comparación/orden en sí (`ordenarFilas`) es una función pura, testeable
 * sin renderizar React; el hook sólo guarda qué columna y en qué dirección.
 */
import { useMemo, useState } from "react";

export type Direccion = "asc" | "desc";
export type ValorColumna<T> = (fila: T) => string | number;

function comparar(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "es");
}

/** Ordena `filas` por la columna `clave` según `columnas[clave]`. Sin `clave`, devuelve `filas` tal cual. */
export function ordenarFilas<T>(
  filas: readonly T[],
  columnas: Record<string, ValorColumna<T>>,
  clave: string | null,
  direccion: Direccion,
): readonly T[] {
  if (clave === null) return filas;
  const valor = columnas[clave];
  if (!valor) return filas;
  const signo = direccion === "asc" ? 1 : -1;
  return [...filas].sort((a, b) => comparar(valor(a), valor(b)) * signo);
}

export function useOrdenTabla<T>(filas: readonly T[], columnas: Record<string, ValorColumna<T>>) {
  const [clave, setClave] = useState<string | null>(null);
  const [direccion, setDireccion] = useState<Direccion>("asc");

  function alternar(nuevaClave: string) {
    if (clave === nuevaClave) {
      setDireccion((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setClave(nuevaClave);
      setDireccion("asc");
    }
  }

  const filasOrdenadas = useMemo(
    () => ordenarFilas(filas, columnas, clave, direccion),
    [filas, columnas, clave, direccion],
  );

  return { filasOrdenadas, clave, direccion, alternar };
}

/** `<th>` clickeable con flechita ▲/▼ cuando es la columna activa. */
export function ThOrdenable({
  titulo,
  columnaClave,
  claveActiva,
  direccion,
  alternar,
  className,
}: {
  titulo: string;
  columnaClave: string;
  claveActiva: string | null;
  direccion: Direccion;
  alternar: (clave: string) => void;
  className?: string;
}) {
  const activa = claveActiva === columnaClave;
  return (
    <th className={`th-ordenable${className ? ` ${className}` : ""}`}>
      <button type="button" className="th-ordenable__btn" onClick={() => alternar(columnaClave)}>
        {titulo}
        <span className="th-ordenable__flecha">{activa ? (direccion === "asc" ? " ▲" : " ▼") : ""}</span>
      </button>
    </th>
  );
}
