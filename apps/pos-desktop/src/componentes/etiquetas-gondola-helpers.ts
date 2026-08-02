/** Fase 10.5: lógica pura de la pantalla de etiquetas de góndola. */
import type { ProductoAdmin } from "../sync/cliente-catalogo-admin";
import type { EtiquetaAImprimir } from "./EtiquetaGondola";

/** Arma la lista plana a imprimir: una entrada por copia pedida de cada producto seleccionado. */
export function armarEtiquetas(
  productos: readonly ProductoAdmin[],
  seleccion: ReadonlyMap<string, number>,
): EtiquetaAImprimir[] {
  const porId = new Map(productos.map((p) => [p.id, p]));
  const etiquetas: EtiquetaAImprimir[] = [];
  for (const [id, cantidad] of seleccion) {
    const p = porId.get(id);
    if (p === undefined || cantidad <= 0) continue;
    for (let i = 0; i < cantidad; i++) {
      etiquetas.push({ codigo: p.codigo, nombre: p.nombre, precio: p.precioVenta });
    }
  }
  return etiquetas;
}

/** Filtra por texto (código, nombre, rubro) y por rubro exacto (vacío = todos). */
export function filtrarProductos(
  productos: readonly ProductoAdmin[],
  busqueda: string,
  rubro: string,
): ProductoAdmin[] {
  const q = busqueda.trim().toLowerCase();
  return productos.filter((p) => {
    if (rubro !== "" && p.categoria?.nombre !== rubro) return false;
    if (q === "") return true;
    return [p.codigo, p.nombre, p.categoria?.nombre ?? ""].some((c) => c.toLowerCase().includes(q));
  });
}

/** Rubros distintos presentes en el catálogo, ordenados. */
export function rubrosDisponibles(productos: readonly ProductoAdmin[]): string[] {
  const set = new Set<string>();
  for (const p of productos) {
    if (p.categoria?.nombre) set.add(p.categoria.nombre);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "es"));
}
