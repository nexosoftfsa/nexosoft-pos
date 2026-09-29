import { describe, expect, it } from 'vitest';
import { ALICUOTAS_IVA, desglosarIvaIncluido, desgloseSinDiscriminar, Money } from '@nexosoft/domain';

import {
  ajustarAlTotal,
  alicuotaDeTipoIva,
  alicuotaImpresa,
  etiquetaAlicuota,
} from './iva-de-producto';

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

/**
 * Lo que mandó el POS es lo que se imprimió en el papel, y es lo que se le
 * declara a ARCA (ADR-0084). El 26/9/2026 la misma venta salió impresa con
 * "IVA 0%" y declarada como exenta, porque cada lado miró su propio catálogo.
 */
describe('alicuotaImpresa', () => {
  it('lee el porcentaje que imprimió el POS', () => {
    expect(alicuotaImpresa('21')).toEqual(ALICUOTAS_IVA.VEINTIUNO);
    expect(alicuotaImpresa('10.5')).toEqual(ALICUOTAS_IVA.DIEZ_CON_CINCO);
    expect(alicuotaImpresa('0')).toEqual(ALICUOTAS_IVA.CERO);
  });

  it('"EXENTO" es exento, y no la alícuota del cero', () => {
    expect(alicuotaImpresa('EXENTO')).toBeNull();
    expect(alicuotaImpresa('EXENTO')).not.toEqual(alicuotaImpresa('0'));
  });

  /** Sin dato o con un dato que no se entiende, manda el catálogo. */
  it('devuelve undefined cuando no hay nada que creerle', () => {
    expect(alicuotaImpresa(undefined)).toBeUndefined();
    expect(alicuotaImpresa('cualquier cosa')).toBeUndefined();
    expect(alicuotaImpresa('13')).toBeUndefined();
  });
});

describe('etiquetaAlicuota', () => {
  it('distingue el exento del cero por ciento', () => {
    expect(etiquetaAlicuota(null)).toBe('EXENTO');
    expect(etiquetaAlicuota(ALICUOTAS_IVA.CERO)).toBe('0');
    expect(etiquetaAlicuota(ALICUOTAS_IVA.VEINTIUNO)).toBe('21');
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
