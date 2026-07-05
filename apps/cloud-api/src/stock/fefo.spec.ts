import { describe, it, expect } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';
import { asignarFefo, type LoteConSaldo } from './fefo';

const d = (n: string) => new Decimal(n);
const lote = (loteId: string, saldo: string, vto: string): LoteConSaldo => ({
  loteId,
  saldo: d(saldo),
  fechaVencimiento: new Date(vto),
});

describe('asignarFefo', () => {
  it('consume el lote que vence antes primero', () => {
    const lotes = [
      lote('nuevo', '10', '2026-12-01'),
      lote('viejo', '10', '2026-08-01'),
    ];
    const { asignaciones, restante } = asignarFefo(lotes, d('5'));
    expect(restante.toString()).toBe('0');
    expect(asignaciones).toEqual([{ loteId: 'viejo', cantidad: d('5') }]);
  });

  it('reparte entre varios lotes cuando uno no alcanza', () => {
    const lotes = [
      lote('l1', '3', '2026-08-01'),
      lote('l2', '10', '2026-09-01'),
    ];
    const { asignaciones, restante } = asignarFefo(lotes, d('7'));
    expect(restante.toString()).toBe('0');
    expect(asignaciones).toEqual([
      { loteId: 'l1', cantidad: d('3') },
      { loteId: 'l2', cantidad: d('4') },
    ]);
  });

  it('devuelve el restante cuando los lotes no cubren la cantidad', () => {
    const lotes = [lote('l1', '2', '2026-08-01')];
    const { asignaciones, restante } = asignarFefo(lotes, d('5'));
    expect(asignaciones).toEqual([{ loteId: 'l1', cantidad: d('2') }]);
    expect(restante.toString()).toBe('3');
  });

  it('ignora lotes con saldo cero o negativo', () => {
    const lotes = [
      lote('agotado', '0', '2026-07-01'),
      lote('bueno', '5', '2026-09-01'),
    ];
    const { asignaciones, restante } = asignarFefo(lotes, d('4'));
    expect(restante.toString()).toBe('0');
    expect(asignaciones).toEqual([{ loteId: 'bueno', cantidad: d('4') }]);
  });

  it('sin lotes, todo queda como restante', () => {
    const { asignaciones, restante } = asignarFefo([], d('3'));
    expect(asignaciones).toEqual([]);
    expect(restante.toString()).toBe('3');
  });
});
