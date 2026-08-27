import { describe, expect, it } from 'vitest';
import { ALICUOTAS_IVA, desglosarIvaIncluido, desgloseSinDiscriminar, Money } from '@nexosoft/domain';

import { ajustarAlTotal, alicuotaDeTipoIva } from './iva-de-producto';

describe('alicuotaDeTipoIva', () => {
  it('traduce las alícuotas que usa el catálogo', () => {
    expect(alicuotaDeTipoIva('IVA_21')).toEqual(ALICUOTAS_IVA.VEINTIUNO);
    expect(alicuotaDeTipoIva('IVA_10_5')).toEqual(ALICUOTAS_IVA.DIEZ_CON_CINCO);
    expect(alicuotaDeTipoIva('IVA_27')).toEqual(ALICUOTAS_IVA.VEINTISIETE);
  });

  it('el exento NO es una alícuota del cero por ciento', () => {
    // ARCA los trata distinto: el exento va en ImpOpEx y sin renglón de IVA.
    expect(alicuotaDeTipoIva('EXENTO')).toBeNull();
    expect(alicuotaDeTipoIva('EXENTO')).not.toEqual(ALICUOTAS_IVA.CERO);
  });

  it('un producto sin tipo de IVA cae en la alícuota general', () => {
    expect(alicuotaDeTipoIva(undefined)).toEqual(ALICUOTAS_IVA.VEINTIUNO);
  });
});

describe('ajustarAlTotal', () => {
  it('no toca un desglose que ya cierra', () => {
    const desglose = desglosarIvaIncluido([
      { importe: Money.desde('121.00'), alicuota: ALICUOTAS_IVA.VEINTIUNO },
    ]);
    const ajustado = ajustarAlTotal(desglose, Money.desde('121.00'));
    expect(ajustado).toBe(desglose);
  });

  it('absorbe los centavos del prorrateo en la alícuota más grande', () => {
    const desglose = desglosarIvaIncluido([
      { importe: Money.desde('100.00'), alicuota: ALICUOTAS_IVA.VEINTIUNO },
      { importe: Money.desde('10.00'), alicuota: ALICUOTAS_IVA.DIEZ_CON_CINCO },
    ]);
    const total = Money.desde('110.02'); // dos centavos de más por el prorrateo
    const ajustado = ajustarAlTotal(desglose, total);

    // Lo que ARCA valida: ImpTotal = ImpNeto + ImpIVA + ImpOpEx.
    expect(ajustado.neto.sumar(ajustado.iva).sumar(ajustado.exento).aDecimalString(2)).toBe(
      '110.02',
    );
    expect(ajustado.total.aDecimalString(2)).toBe('110.02');

    // Los dos centavos fueron a la base del 21%, que es la de mayor importe.
    const base21 = ajustado.porAlicuota.find(
      (r) => r.codigoArca === ALICUOTAS_IVA.VEINTIUNO.codigoArca,
    );
    const base105 = ajustado.porAlicuota.find(
      (r) => r.codigoArca === ALICUOTAS_IVA.DIEZ_CON_CINCO.codigoArca,
    );
    expect(base21?.base.aDecimalString(2)).toBe('82.66'); // 82.64 + 0.02
    expect(base105?.base.aDecimalString(2)).toBe('9.05');
  });

  it('corrige también hacia abajo', () => {
    const desglose = desglosarIvaIncluido([
      { importe: Money.desde('121.00'), alicuota: ALICUOTAS_IVA.VEINTIUNO },
    ]);
    const ajustado = ajustarAlTotal(desglose, Money.desde('120.99'));
    expect(ajustado.neto.sumar(ajustado.iva).aDecimalString(2)).toBe('120.99');
  });

  it('en un comprobante C el total va entero al neto', () => {
    const desglose = desgloseSinDiscriminar(Money.desde('500.00'));
    const ajustado = ajustarAlTotal(desglose, Money.desde('500.05'));
    expect(ajustado.neto.aDecimalString(2)).toBe('500.05');
    expect(ajustado.iva.esCero()).toBe(true);
    expect(ajustado.porAlicuota).toHaveLength(0);
  });
});
