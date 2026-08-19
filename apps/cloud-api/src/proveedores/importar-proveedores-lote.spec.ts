import { describe, it, expect } from 'vitest';
import {
  mapearFilaProveedorCruda,
  claveProveedor,
  COLUMNAS_IMPORTAR_PROVEEDORES as COL,
} from './importar-proveedores-lote';

function filaCruda(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    [COL.nombre]: 'Distribuidora Sur',
    [COL.cuit]: '30-12345678-9',
    [COL.contacto]: 'Juan Pérez',
    [COL.telefono]: '011-4444-5555',
    [COL.email]: 'ventas@sur.com',
    [COL.activo]: 'S',
    ...overrides,
  };
}

describe('mapearFilaProveedorCruda', () => {
  it('mapea el camino feliz', () => {
    const r = mapearFilaProveedorCruda(filaCruda());
    expect(r).toEqual({
      nombre: 'Distribuidora Sur',
      cuit: '30-12345678-9',
      contacto: 'Juan Pérez',
      telefono: '011-4444-5555',
      email: 'ventas@sur.com',
      activo: true,
    });
  });

  it('columnas opcionales vacías se mapean a null, no a string vacío', () => {
    const r = mapearFilaProveedorCruda(
      filaCruda({ [COL.cuit]: '', [COL.contacto]: '  ', [COL.telefono]: '', [COL.email]: '' }),
    );
    expect(r.cuit).toBeNull();
    expect(r.contacto).toBeNull();
    expect(r.telefono).toBeNull();
    expect(r.email).toBeNull();
  });

  it('Activo=N mapea a activo:false; sin columna Activo default activo:true', () => {
    expect(mapearFilaProveedorCruda(filaCruda({ [COL.activo]: 'N' })).activo).toBe(false);
    expect(mapearFilaProveedorCruda(filaCruda({ [COL.activo]: '' })).activo).toBe(true);
  });

  it('rechaza una fila sin nombre', () => {
    expect(() => mapearFilaProveedorCruda(filaCruda({ [COL.nombre]: '  ' }))).toThrow('sin nombre');
  });
});

describe('claveProveedor', () => {
  it('mismo nombre (sin importar mayúsculas) y mismo CUIT dan la misma clave', () => {
    expect(claveProveedor('Distribuidora Sur', '30-1')).toBe(claveProveedor('distribuidora sur', '30-1'));
  });

  it('mismo nombre pero distinto CUIT da clave distinta', () => {
    expect(claveProveedor('Distribuidora Sur', '30-1')).not.toBe(claveProveedor('Distribuidora Sur', '30-2'));
  });
});
