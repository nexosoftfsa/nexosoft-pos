/**
 * Puerto del libro de ventas: registro tabular (una fila por venta) que se va
 * actualizando para control del dueño (ADR-0021). El adaptador por defecto
 * escribe un Excel en la carpeta de respaldo (que puede ser Drive/OneDrive).
 */

export interface FilaVenta {
  fecha: Date;
  operacionId: string;
  comprobante: string;
  sucursalId: string;
  usuario: string;
  medioPago: string;
  cantidadItems: number;
  subtotal: string;
  descuento: string;
  total: string;
  cae: string;
}

export interface LibroDeVentas {
  /** Agrega (o actualiza, si ya existe el operacionId) una fila del libro. */
  registrar(fila: FilaVenta): Promise<void>;
}

export const LIBRO_DE_VENTAS = Symbol('LIBRO_DE_VENTAS');
