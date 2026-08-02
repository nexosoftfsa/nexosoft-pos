import { describe, it, expect } from 'vitest';
import { mapearAlicuota, mapearArticulo, type FilaCatalogo } from './importar-articulos';

function fila(overrides: Partial<FilaCatalogo> = {}): FilaCatalogo {
  return {
    codigo: 7790310985113,
    descripcion: '3D QUESO 43GR',
    rubro: 'Kiosco',
    precioCosto: 1500,
    porcentajeIva: 0,
    precioVenta: 2100,
    stock: 3,
    activo: 'S',
    ...overrides,
  };
}

describe('mapearAlicuota', () => {
  it('mapea los porcentajes conocidos', () => {
    expect(mapearAlicuota(0)).toBe('EXENTO');
    expect(mapearAlicuota(10)).toBe('IVA_10_5');
    expect(mapearAlicuota(10.5)).toBe('IVA_10_5');
    expect(mapearAlicuota(21)).toBe('IVA_21');
    expect(mapearAlicuota(27)).toBe('IVA_27');
  });

  it('lanza si no reconoce el porcentaje (dato a revisar a mano)', () => {
    expect(() => mapearAlicuota(15)).toThrow('% IVA no reconocido: 15');
  });
});

describe('mapearArticulo', () => {
  it('mapea el camino feliz', () => {
    const r = mapearArticulo(fila());
    expect(r.codigo).toBe('7790310985113');
    expect(r.nombre).toBe('3D QUESO 43GR');
    expect(r.categoriaNombre).toBe('Kiosco');
    expect(r.tipoIva).toBe('EXENTO');
    expect(r.precioVenta).toBe('2100.00');
    expect(r.precioCosto).toBe('1500.00');
    expect(r.activo).toBe(true);
    expect(r.stockInicial).toBe('3');
    expect(r.advertencias).toHaveLength(0);
  });

  it('código numérico corto (interno, no EAN) se acepta igual', () => {
    const r = mapearArticulo(fila({ codigo: 3, descripcion: 'GRISINES' }));
    expect(r.codigo).toBe('3');
  });

  it('rubro vacío/null cae en "Sin Clasificar"', () => {
    expect(mapearArticulo(fila({ rubro: '' })).categoriaNombre).toBe('Sin Clasificar');
    expect(mapearArticulo(fila({ rubro: null })).categoriaNombre).toBe('Sin Clasificar');
    expect(mapearArticulo(fila({ rubro: undefined })).categoriaNombre).toBe('Sin Clasificar');
  });

  it('stock negativo se importa en null (no se siembra) y queda advertencia', () => {
    const r = mapearArticulo(fila({ stock: -5 }));
    expect(r.stockInicial).toBeNull();
    expect(r.advertencias).toEqual(['Stock negativo en el archivo original (-5) — se importa en 0.']);
  });

  it('stock en 0 tampoco siembra movimiento, sin advertencia', () => {
    const r = mapearArticulo(fila({ stock: 0 }));
    expect(r.stockInicial).toBeNull();
    expect(r.advertencias).toHaveLength(0);
  });

  it('stock fraccionado (venta por peso) se preserva como string decimal', () => {
    expect(mapearArticulo(fila({ stock: 1.5 })).stockInicial).toBe('1.5');
  });

  it('precio de venta o costo en 0 quedan advertidos', () => {
    const r = mapearArticulo(fila({ precioVenta: 0, precioCosto: 0 }));
    expect(r.advertencias).toEqual([
      'Precio de venta en $0 — revisar antes de vender.',
      'Precio de costo en $0.',
    ]);
  });

  it('Activo=N mapea a activo:false; sin columna Activo default activo:true', () => {
    expect(mapearArticulo(fila({ activo: 'N' })).activo).toBe(false);
    expect(mapearArticulo(fila({ activo: undefined })).activo).toBe(true);
  });

  it('nombre muy largo se trunca a 200 y queda advertido', () => {
    const largo = 'X'.repeat(250);
    const r = mapearArticulo(fila({ descripcion: largo }));
    expect(r.nombre).toHaveLength(200);
    expect(r.advertencias).toContain('Nombre truncado a 200 caracteres.');
  });

  it('rechaza fila sin código', () => {
    expect(() => mapearArticulo(fila({ codigo: '' }))).toThrow('Fila sin código');
  });

  it('rechaza fila sin descripción', () => {
    expect(() => mapearArticulo(fila({ descripcion: '  ' }))).toThrow('sin descripción');
  });
});
