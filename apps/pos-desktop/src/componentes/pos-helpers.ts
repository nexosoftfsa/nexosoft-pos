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

/** Busca un producto por código exacto (interno o de barras) — lo que dispara un escaneo. */
export function buscarProductoPorCodigo(
  catalogo: readonly ProductoCatalogo[],
  codigo: string,
): ProductoCatalogo | undefined {
  return catalogo.find((p) => p.articulo.codigoInterno === codigo || p.articulo.codigoBarras === codigo);
}

/**
 * Ítem del carrito de venta. Extraído acá (Fase 15) para que la lógica de
 * cantidad/eliminar sea pura y testeable sin montar `PantallaPos` — la usan
 * también los atajos de teclado (F8 cambia cantidad, Supr elimina el
 * último ítem).
 */
export interface ItemCarrito {
  readonly producto: ProductoCatalogo;
  readonly cantidad: number;
}

/** Suma/resta `delta` a la cantidad del ítem con ese `id`; lo saca del carrito si llega a 0 o menos. */
export function cambiarCantidadCarrito(
  carrito: readonly ItemCarrito[],
  id: string,
  delta: number,
): ItemCarrito[] {
  return carrito.flatMap((c) => {
    if (c.producto.articulo.id !== id) return [c];
    const nueva = c.cantidad + delta;
    return nueva <= 0 ? [] : [{ ...c, cantidad: nueva }];
  });
}

/** Fija la cantidad absoluta del ítem con ese `id` (ej. atajo F8); lo saca si es ≤ 0. */
export function fijarCantidadCarrito(
  carrito: readonly ItemCarrito[],
  id: string,
  cantidad: number,
): ItemCarrito[] {
  return carrito.flatMap((c) => {
    if (c.producto.articulo.id !== id) return [c];
    return cantidad <= 0 ? [] : [{ ...c, cantidad }];
  });
}

/** Saca del carrito el ítem con ese `id`. */
export function quitarDelCarrito(carrito: readonly ItemCarrito[], id: string): ItemCarrito[] {
  return carrito.filter((c) => c.producto.articulo.id !== id);
}

/** Último ítem agregado (los nuevos se appendean al final) — el que afectan los atajos F8/Supr. */
export function ultimoItemCarrito(carrito: readonly ItemCarrito[]): ItemCarrito | undefined {
  return carrito[carrito.length - 1];
}
