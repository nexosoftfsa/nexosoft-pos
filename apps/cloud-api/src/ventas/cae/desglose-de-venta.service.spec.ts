import { describe, expect, it } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';
import { ALICUOTAS_IVA } from '@nexosoft/domain';

import type { PrismaService } from '../../prisma/prisma.service';
import { DesgloseDeVentaService } from './desglose-de-venta.service';

/** Prisma de mentira con un catálogo fijo: sólo se le piden `id` y `tipoIva`. */
function servicio(catalogo: Record<string, string>): DesgloseDeVentaService {
  const prisma = {
    producto: {
      findMany: ({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(
          where.id.in
            .filter((id) => catalogo[id] !== undefined)
            .map((id) => ({ id, tipoIva: catalogo[id] })),
        ),
    },
  };
  return new DesgloseDeVentaService(prisma as unknown as PrismaService);
}

const ARROZ = 'arroz';
const AGUA = 'agua';
const CATALOGO = { [ARROZ]: 'EXENTO', [AGUA]: 'IVA_21' };

/**
 * La venta de Sebastián del 26/9/2026: arroz exento de $ 1.450 y agua al 21% de
 * $ 10.000. El papel decía una cosa y ARCA recibió otra, porque el POS imprimía
 * con su catálogo (viejo, que no podía actualizarse — ADR-0084) y el servidor
 * declaraba con el suyo.
 */
describe('DesgloseDeVentaService.deLineas', () => {
  const arroz = { productoId: ARROZ, subtotal: new Decimal('1450.00') };
  const agua = { productoId: AGUA, subtotal: new Decimal('10000.00') };
  const total = new Decimal('11450.00');

  it('sin alícuota del POS, usa el catálogo del servidor (como siempre)', async () => {
    const d = await servicio(CATALOGO).deLineas([arroz, agua], 'FacturaA', total);
    expect(d.exento.aDecimalString(2)).toBe('1450.00');
    expect(d.neto.aDecimalString(2)).toBe('8264.46');
    expect(d.iva.aDecimalString(2)).toBe('1735.54');
  });

  /**
   * Éste es el caso que importa: el catálogo del servidor dice exento y el POS
   * imprimió IVA 0%. Gana lo impreso — el papel que se llevó el cliente ES el
   * comprobante.
   */
  it('con alícuota del POS, declara lo que se imprimió', async () => {
    const d = await servicio(CATALOGO).deLineas(
      [
        { ...arroz, alicuotaIva: '0' },
        { ...agua, alicuotaIva: '21' },
      ],
      'FacturaA',
      total,
    );
    // El arroz ya no va a ImpOpEx: va con renglón de IVA 0%, que es lo que dice
    // el papel.
    expect(d.exento.aDecimalString(2)).toBe('0.00');
    expect(d.neto.aDecimalString(2)).toBe('9714.46');
    expect(d.iva.aDecimalString(2)).toBe('1735.54');
    expect(d.porAlicuota.map((r) => r.codigoArca)).toContain(ALICUOTAS_IVA.CERO.codigoArca);
  });

  it('EXENTO del POS manda a ImpOpEx aunque el catálogo diga 21%', async () => {
    const d = await servicio({ [ARROZ]: 'IVA_21', [AGUA]: 'IVA_21' }).deLineas(
      [
        { ...arroz, alicuotaIva: 'EXENTO' },
        { ...agua, alicuotaIva: '21' },
      ],
      'FacturaA',
      total,
    );
    expect(d.exento.aDecimalString(2)).toBe('1450.00');
    expect(d.neto.aDecimalString(2)).toBe('8264.46');
  });

  /** Un valor que no se entiende no puede cambiar lo que se declara. */
  it('ante un dato ilegible del POS, vuelve al catálogo', async () => {
    const d = await servicio(CATALOGO).deLineas(
      [
        { ...arroz, alicuotaIva: 'cualquier cosa' },
        { ...agua, alicuotaIva: '21' },
      ],
      'FacturaA',
      total,
    );
    expect(d.exento.aDecimalString(2)).toBe('1450.00');
  });

  /** En una C no se discrimina, venga lo que venga. */
  it('en un comprobante C no discrimina nada', async () => {
    const d = await servicio(CATALOGO).deLineas(
      [
        { ...arroz, alicuotaIva: '21' },
        { ...agua, alicuotaIva: '21' },
      ],
      'FacturaC',
      total,
    );
    expect(d.neto.aDecimalString(2)).toBe('11450.00');
    expect(d.iva.esCero()).toBe(true);
    expect(d.porAlicuota).toHaveLength(0);
  });

  /** Sea cual sea el origen de la tasa, ARCA valida esto al centavo. */
  it('siempre cierra: total = neto + iva + exento', async () => {
    const casos = [
      [arroz, agua],
      [
        { ...arroz, alicuotaIva: '0' },
        { ...agua, alicuotaIva: '21' },
      ],
      [
        { ...arroz, alicuotaIva: 'EXENTO' },
        { ...agua, alicuotaIva: '10.5' },
      ],
    ];
    for (const items of casos) {
      const d = await servicio(CATALOGO).deLineas(items, 'FacturaA', total);
      expect(d.neto.sumar(d.iva).sumar(d.exento).aDecimalString(2)).toBe('11450.00');
      expect(d.total.aDecimalString(2)).toBe('11450.00');
    }
  });
});
