import { describe, it, expect } from 'vitest';
import { mapearFilaProductoCruda, COLUMNAS_IMPORTAR_PRODUCTOS as COL } from './importar-productos-lote';

function filaCruda(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    [COL.codigo]: '7790310985113',
    [COL.descripcion]: '3D QUESO 43GR',
    [COL.rubro]: 'Kiosco',
    [COL.precioCosto]: '1500',
    [COL.porcentajeIva]: '0',
    [COL.precioVenta]: '2100',
    [COL.stock]: '3',
    [COL.activo]: 'S',
    ...overrides,
  };
}

describe('mapearFilaProductoCruda', () => {
  it('convierte los valores de texto (como llegan de un Excel leído por la UI) a los tipos de mapearArticulo', () => {
    const r = mapearFilaProductoCruda(filaCruda());
    expect(r.codigo).toBe('7790310985113');
    expect(r.categoriaNombre).toBe('Kiosco');
    expect(r.tipoIva).toBe('EXENTO');
    expect(r.precioVenta).toBe('2100.00');
    expect(r.stockInicial).toBe('3');
  });

  it('columnas numéricas ausentes se tratan como 0', () => {
    const r = mapearFilaProductoCruda(filaCruda({ [COL.precioCosto]: '', [COL.stock]: '' }));
    expect(r.precioCosto).toBe('0.00');
    expect(r.stockInicial).toBeNull();
  });

  it('rubro en blanco cae en la categoría por defecto', () => {
    expect(mapearFilaProductoCruda(filaCruda({ [COL.rubro]: '' })).categoriaNombre).toBe('Sin Clasificar');
  });

  it('propaga el error de mapearArticulo si falta el código', () => {
    expect(() => mapearFilaProductoCruda(filaCruda({ [COL.codigo]: '' }))).toThrow('Fila sin código');
  });

  it('propaga el error si el % IVA no se reconoce', () => {
    expect(() => mapearFilaProductoCruda(filaCruda({ [COL.porcentajeIva]: '15' }))).toThrow('% IVA no reconocido');
  });
});
