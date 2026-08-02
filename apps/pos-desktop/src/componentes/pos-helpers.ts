/**
 * Lógica pura de la pantalla de venta. Extraída para poder testear sin
 * montar el componente (Fase 10: el catálogo pasó de ~9 artículos demo a
 * 711 reales, la grilla de venta necesita filtrarse).
 */
import type { ProductoCatalogo } from "../datos/bootstrap";

/** Filtra el catálogo de venta por texto (código interno, código de barras o descripción). */
export function filtrarCatalogoVenta(
  catalogo: readonly ProductoCatalogo[],
  busqueda: string,
): ProductoCatalogo[] {
  const q = busqueda.trim().toLowerCase();
  if (q === "") return [...catalogo];
  return catalogo.filter((p) =>
    [p.articulo.codigoInterno, p.articulo.codigoBarras ?? "", p.articulo.descripcion].some(
      (campo) => campo.toLowerCase().includes(q),
    ),
  );
}
