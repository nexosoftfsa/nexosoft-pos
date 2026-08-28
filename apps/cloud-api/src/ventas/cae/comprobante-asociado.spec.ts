import { describe, expect, it } from 'vitest';

import { comprobanteAsociadoDe } from './comprobante-asociado';

describe('comprobanteAsociadoDe', () => {
  it('traduce el original al CbtesAsoc que pide ARCA', () => {
    expect(comprobanteAsociadoDe({ tipoComprobante: 'FacturaB', numeroComprobante: 9 })).toEqual([
      { codigoComprobante: 6, numero: 9 },
    ]);
  });

  it('conserva la letra: una Factura A se anula referenciando una Factura A', () => {
    expect(comprobanteAsociadoDe({ tipoComprobante: 'FacturaA', numeroComprobante: 3 })).toEqual([
      { codigoComprobante: 1, numero: 3 },
    ]);
    expect(comprobanteAsociadoDe({ tipoComprobante: 'FacturaC', numeroComprobante: 3 })).toEqual([
      { codigoComprobante: 11, numero: 3 },
    ]);
  });

  it('un ticket no fiscal no existe en ARCA: no hay nada que referenciar', () => {
    expect(
      comprobanteAsociadoDe({ tipoComprobante: 'TicketNoFiscal', numeroComprobante: 5 }),
    ).toEqual([]);
  });

  it('sin número todavía no se puede referenciar', () => {
    expect(comprobanteAsociadoDe({ tipoComprobante: 'FacturaB', numeroComprobante: null })).toEqual(
      [],
    );
    expect(comprobanteAsociadoDe({ tipoComprobante: null, numeroComprobante: 9 })).toEqual([]);
  });

  it('no manda la fecha del asociado: es opcional y si no coincide es rechazo', () => {
    const [asociado] = comprobanteAsociadoDe({
      tipoComprobante: 'FacturaB',
      numeroComprobante: 9,
    });
    expect(asociado).not.toHaveProperty('fecha');
  });
});
