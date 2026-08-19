import { describe, it, expect } from 'vitest';
import { mapearFilaStockCruda, COLUMNAS_IMPORTAR_STOCK as COL } from './importar-stock-lote';

function filaCruda(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    [COL.codigo]: '111',
    [COL.cantidad]: '25',
    [COL.fechaVencimiento]: '',
    [COL.motivo]: '',
    ...overrides,
  };
}

describe('mapearFilaStockCruda', () => {
  it('mapea el camino feliz (sin fecha, motivo por defecto)', () => {
    const r = mapearFilaStockCruda(filaCruda());
    expect(r).toEqual({ codigo: '111', cantidad: '25', fechaVencimiento: null, motivo: 'Importación de stock' });
  });

  it('preserva la fecha de vencimiento y el motivo si vienen', () => {
    const r = mapearFilaStockCruda(filaCruda({ [COL.fechaVencimiento]: '2027-05-01', [COL.motivo]: 'Compra inicial' }));
    expect(r.fechaVencimiento).toBe('2027-05-01');
    expect(r.motivo).toBe('Compra inicial');
  });

  it('acepta cantidades fraccionadas (venta por peso)', () => {
    expect(mapearFilaStockCruda(filaCruda({ [COL.cantidad]: '1.5' })).cantidad).toBe('1.5');
  });

  it('rechaza una fila sin código', () => {
    expect(() => mapearFilaStockCruda(filaCruda({ [COL.codigo]: '' }))).toThrow('Fila sin código');
  });

  it('rechaza cantidad no numérica', () => {
    expect(() => mapearFilaStockCruda(filaCruda({ [COL.cantidad]: 'abc' }))).toThrow('Cantidad inválida');
  });

  it('rechaza cantidad cero o negativa', () => {
    expect(() => mapearFilaStockCruda(filaCruda({ [COL.cantidad]: '0' }))).toThrow('Cantidad inválida');
    expect(() => mapearFilaStockCruda(filaCruda({ [COL.cantidad]: '-5' }))).toThrow('Cantidad inválida');
  });
});
