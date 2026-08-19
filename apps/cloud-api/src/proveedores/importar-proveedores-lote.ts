/**
 * Fase 14.C: mapeo PURO de una fila cruda de Excel (tal como la lee el
 * botón Importar del POS) a los datos de un proveedor. Sin I/O -- separa
 * "¿el texto de la celda tiene la forma correcta?" de "¿ya existe este
 * proveedor?" (que resuelve `ProveedoresService.importarProveedores`).
 */

export const COLUMNAS_IMPORTAR_PROVEEDORES = {
  nombre: 'Proveedor',
  cuit: 'CUIT',
  contacto: 'Contacto',
  telefono: 'Teléfono',
  email: 'Email',
  activo: 'Activo',
} as const;

export type FilaProveedorCruda = Record<string, string>;

export interface ProveedorAImportar {
  readonly nombre: string;
  readonly cuit: string | null;
  readonly contacto: string | null;
  readonly telefono: string | null;
  readonly email: string | null;
  readonly activo: boolean;
}

function celda(valor: string | undefined): string | null {
  const limpio = valor?.trim();
  return limpio && limpio !== '' ? limpio : null;
}

/** Mapea una fila cruda a los datos de un proveedor. Lanza si falta el nombre (obligatorio). */
export function mapearFilaProveedorCruda(cruda: FilaProveedorCruda): ProveedorAImportar {
  const col = COLUMNAS_IMPORTAR_PROVEEDORES;
  const nombre = (cruda[col.nombre] ?? '').trim();
  if (nombre === '') {
    throw new Error('Fila sin nombre de proveedor: no se puede importar.');
  }
  return {
    nombre,
    cuit: celda(cruda[col.cuit]),
    contacto: celda(cruda[col.contacto]),
    telefono: celda(cruda[col.telefono]),
    email: celda(cruda[col.email]),
    activo: (cruda[col.activo] ?? 'S').trim().toUpperCase() !== 'N',
  };
}

/** Clave de deduplicación: mismo nombre (sin importar mayúsculas) y mismo CUIT. */
export function claveProveedor(nombre: string, cuit: string | null): string {
  return `${nombre.trim().toLowerCase()}|${cuit ?? ''}`;
}
