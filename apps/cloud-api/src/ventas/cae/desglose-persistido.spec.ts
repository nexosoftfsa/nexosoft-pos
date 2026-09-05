import { describe, expect, it } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';
import { ALICUOTAS_IVA, desglosarIvaIncluido, desgloseSinDiscriminar, Money } from '@nexosoft/domain';

import { aDesglosePersistido, leerDesglosePersistido } from './desglose-persistido';

describe('aDesglosePersistido', () => {
  it('guarda los tres importes y el detalle por alícuota', () => {
    const d = desglosarIvaIncluido([
      { importe: Money.desde('1210.00'), alicuota: ALICUOTAS_IVA.VEINTIUNO },
      { importe: Money.desde('110.50'), alicuota: ALICUOTAS_IVA.DIEZ_CON_CINCO },
    ]);

    const p = aDesglosePersistido(d);

    expect(p.impNeto.toFixed(2)).toBe(d.neto.aDecimalString(2));
    expect(p.impIva.toFixed(2)).toBe(d.iva.aDecimalString(2));
    expect(p.impOpEx.toFixed(2)).toBe('0.00');
    expect(p.ivaPorAlicuota).toEqual([
      { codigoArca: 4, base: expect.any(String), importe: expect.any(String) },
      { codigoArca: 5, base: expect.any(String), importe: expect.any(String) },
    ]);
  });

  it('un comprobante C no lleva detalle: no discrimina', () => {
    const p = aDesglosePersistido(desgloseSinDiscriminar(Money.desde('1000.00')));
    expect(p.impNeto.toFixed(2)).toBe('1000.00');
    expect(p.ivaPorAlicuota).toEqual([]);
  });

  it('lo exento va separado del neto gravado', () => {
    const d = desglosarIvaIncluido([
      { importe: Money.desde('1210.00'), alicuota: ALICUOTAS_IVA.VEINTIUNO },
      { importe: Money.desde('500.00'), alicuota: null },
    ]);
    const p = aDesglosePersistido(d);
    expect(p.impOpEx.toFixed(2)).toBe('500.00');
    expect(p.impNeto.toFixed(2)).toBe('1000.00');
  });
});

describe('leerDesglosePersistido', () => {
  it('devuelve null en un comprobante viejo, sin desglose guardado', () => {
    expect(
      leerDesglosePersistido({
        impNeto: null,
        impIva: null,
        impOpEx: null,
        ivaPorAlicuota: null,
      }),
    ).toBeNull();
  });

  it('lee lo guardado', () => {
    const leido = leerDesglosePersistido({
      impNeto: new Decimal('1000.00'),
      impIva: new Decimal('210.00'),
      impOpEx: new Decimal('0.00'),
      ivaPorAlicuota: [{ codigoArca: 5, base: '1000.00', importe: '210.00' }],
    });

    expect(leido).toEqual({
      neto: '1000.00',
      iva: '210.00',
      exento: '0.00',
      porAlicuota: [{ codigoArca: 5, base: '1000.00', importe: '210.00' }],
    });
  });

  /**
   * Lo que vuelve de una columna Json es `unknown`: puede haber quedado
   * cualquier cosa de una versión anterior o de una escritura a mano. Se
   * descarta el renglón malo en vez de romper la reimpresión entera.
   */
  it('descarta renglones con forma inesperada', () => {
    const leido = leerDesglosePersistido({
      impNeto: new Decimal('1000.00'),
      impIva: new Decimal('210.00'),
      impOpEx: new Decimal('0.00'),
      ivaPorAlicuota: [
        { codigoArca: 5, base: '1000.00', importe: '210.00' },
        { codigoArca: 'cinco', base: 1000, importe: null },
        null,
        'basura',
      ],
    });

    expect(leido?.porAlicuota).toEqual([{ codigoArca: 5, base: '1000.00', importe: '210.00' }]);
  });

  it('un json que no es array no rompe', () => {
    const leido = leerDesglosePersistido({
      impNeto: new Decimal('1000.00'),
      impIva: new Decimal('0.00'),
      impOpEx: new Decimal('0.00'),
      ivaPorAlicuota: { algo: 'raro' },
    });
    expect(leido?.porAlicuota).toEqual([]);
  });
});
