/**
 * Fase 14.D: mapeo PURO de una fila cruda de Excel (carga inicial de
 * existencias) a los datos de una carga de stock. Sin I/O -- separa
 * "¿el texto de la celda tiene la forma correcta?" de "¿existe el
 * producto? ¿es perecedero y necesita fecha de vencimiento?" (que resuelve
 * `StockService.importarStock`, porque necesita consultar el producto).
 */

export const COLUMNAS_IMPORTAR_STOCK = {
  codigo: 'Código',
  cantidad: 'Cantidad a cargar',
  fechaVencimiento: 'Fecha de vencimiento',
  motivo: 'Motivo',
} as const;

export type FilaStockCruda = Record<string, string>;

const MOTIVO_DEFECTO = 'Importación de stock';

export interface CargaStockAImportar {
  readonly codigo: string;
  readonly cantidad: string;
  /** `null` si la fila no trae fecha -- válido para productos que no requieren lote. */
  readonly fechaVencimiento: string | null;
  readonly motivo: string;
}

/** Mapea una fila cruda a una carga de stock. Lanza si falta el código o la cantidad no es un número positivo. */
export function mapearFilaStockCruda(cruda: FilaStockCruda): CargaStockAImportar {
  const col = COLUMNAS_IMPORTAR_STOCK;
  const codigo = (cruda[col.codigo] ?? '').trim();
  if (codigo === '') {
    throw new Error('Fila sin código: no se puede importar.');
  }
  const cantidadTexto = (cruda[col.cantidad] ?? '').trim();
  const cantidad = Number(cantidadTexto);
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    throw new Error(`Cantidad inválida para el código ${codigo}: "${cantidadTexto}"`);
  }
  const fechaTexto = cruda[col.fechaVencimiento]?.trim();
  const motivoTexto = cruda[col.motivo]?.trim();
  return {
    codigo,
    cantidad: cantidadTexto,
    fechaVencimiento: fechaTexto && fechaTexto !== '' ? fechaTexto : null,
    motivo: motivoTexto && motivoTexto !== '' ? motivoTexto : MOTIVO_DEFECTO,
  };
}
