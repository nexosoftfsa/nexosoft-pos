/**
 * Fase 14.B: adapta una fila "cruda" (tal como la lee el botón Importar del
 * POS desde un Excel — un objeto con las mismas columnas que ya usa
 * `scripts/importar-catalogo.mjs`) al `FilaCatalogo` que espera
 * `mapearArticulo()`. Función PURA, sin I/O — separa "¿el texto de la celda
 * tiene la forma correcta?" de "¿esto ya existe en la base?" (que resuelve
 * `CatalogoService.importarProductos`).
 */
import { mapearArticulo, type ArticuloAImportar, type FilaCatalogo } from './importar-articulos';

/** Mismas columnas que `COLUMNAS` en scripts/importar-catalogo.mjs — una sola fuente de verdad de nombres. */
export const COLUMNAS_IMPORTAR_PRODUCTOS = {
  codigo: 'Código de barras',
  descripcion: 'Descripción',
  rubro: 'Rubro',
  precioCosto: 'Precio Costo',
  porcentajeIva: '% IVA',
  precioVenta: 'Precio Venta',
  stock: 'Stock',
  activo: 'Activo',
} as const;

export type FilaProductoCruda = Record<string, string>;

/** Convierte los valores de texto de la fila a los tipos que espera `mapearArticulo`. */
function filaCrudaAFilaCatalogo(cruda: FilaProductoCruda): FilaCatalogo {
  const col = COLUMNAS_IMPORTAR_PRODUCTOS;
  return {
    codigo: (cruda[col.codigo] ?? '').trim(),
    descripcion: (cruda[col.descripcion] ?? '').trim(),
    rubro: cruda[col.rubro]?.trim() || null,
    precioCosto: Number(cruda[col.precioCosto] ?? 0),
    porcentajeIva: Number(cruda[col.porcentajeIva] ?? 0),
    precioVenta: Number(cruda[col.precioVenta] ?? 0),
    stock: Number(cruda[col.stock] ?? 0),
    activo: cruda[col.activo] ?? null,
  };
}

/** Mapea una fila cruda a `ArticuloAImportar`. Lanza (mismo criterio que `mapearArticulo`) si la fila es inválida. */
export function mapearFilaProductoCruda(cruda: FilaProductoCruda): ArticuloAImportar {
  return mapearArticulo(filaCrudaAFilaCatalogo(cruda));
}
