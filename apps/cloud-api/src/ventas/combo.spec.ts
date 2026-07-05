import { describe, it, expect } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';
import { expandirStockDeVenta, type ComponenteCombo } from './combo';

const d = (n: string) => new Decimal(n);

describe('expandirStockDeVenta', () => {
  it('un ítem simple genera un movimiento sobre sí mismo', () => {
    const plan = expandirStockDeVenta([{ productoId: 'p1', cantidad: d('3') }], new Map());
    expect(plan).toHaveLength(1);
    expect(plan[0]!.productoId).toBe('p1');
    expect(plan[0]!.cantidad.toString()).toBe('3');
  });

  it('un combo genera un movimiento por componente, multiplicando cantidades', () => {
    const combos = new Map<string, ComponenteCombo[]>([
      [
        'combo1',
        [
          { componenteId: 'gaseosa', cantidad: d('2') },
          { componenteId: 'alfajor', cantidad: d('1') },
        ],
      ],
    ]);
    const plan = expandirStockDeVenta([{ productoId: 'combo1', cantidad: d('3') }], combos);
    expect(plan).toEqual([
      { productoId: 'gaseosa', cantidad: d('6') },
      { productoId: 'alfajor', cantidad: d('3') },
    ]);
  });

  it('mezcla simples y combos en la misma venta', () => {
    const combos = new Map<string, ComponenteCombo[]>([
      ['combo1', [{ componenteId: 'gaseosa', cantidad: d('2') }]],
    ]);
    const plan = expandirStockDeVenta(
      [
        { productoId: 'combo1', cantidad: d('1') },
        { productoId: 'pan', cantidad: d('5') },
      ],
      combos,
    );
    expect(plan).toEqual([
      { productoId: 'gaseosa', cantidad: d('2') },
      { productoId: 'pan', cantidad: d('5') },
    ]);
  });

  it('un combo sin componentes en el mapa cae al camino simple', () => {
    const plan = expandirStockDeVenta(
      [{ productoId: 'comboVacio', cantidad: d('2') }],
      new Map([['comboVacio', []]]),
    );
    expect(plan).toEqual([{ productoId: 'comboVacio', cantidad: d('2') }]);
  });

  it('soporta cantidades fraccionadas del componente', () => {
    const combos = new Map<string, ComponenteCombo[]>([
      ['combo1', [{ componenteId: 'cafe', cantidad: d('0.25') }]],
    ]);
    const plan = expandirStockDeVenta([{ productoId: 'combo1', cantidad: d('4') }], combos);
    expect(plan[0]!.cantidad.toString()).toBe('1');
    // 0.25 × 2 = 0.5 (media unidad del componente por medio combo).
    const medio = expandirStockDeVenta([{ productoId: 'combo1', cantidad: d('2') }], combos);
    expect(medio[0]!.cantidad.toString()).toBe('0.5');
  });
});
