import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';

import { CaePendientesService } from './cae-pendientes.service';
import { ErrorCaeNoDisponible, ErrorCaeRechazado } from './servicio-cae';
import { DesgloseDeVentaService } from './desglose-de-venta.service';

/**
 * Fechas RELATIVAS a hoy, no fijas.
 *
 * ARCA sólo autoriza comprobantes de hasta 5 días (`ventana-de-fecha.ts`), así
 * que una fecha fija en el fixture haría que estos tests empezaran a fallar
 * solos al pasar esa cantidad de días.
 */
function haceDias(n: number, hora = 10): Date {
  const f = new Date();
  f.setDate(f.getDate() - n);
  f.setHours(hora, 0, 0, 0);
  return f;
}

function venta(id: string, creadaEn: Date = haceDias(1), extra: Record<string, unknown> = {}) {
  return {
    id,
    creadaEn,
    tipoComprobante: 'FacturaB',
    total: new Decimal('1000'),
    sucursalId: 's1',
    comprobanteAsociadoId: null,
    ...extra,
  };
}

describe('CaePendientesService', () => {
  const prisma = {
    venta: { findMany: vi.fn(), update: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
    // El reintento reconstruye el desglose de IVA desde los ítems guardados.
    itemVenta: { findMany: vi.fn() },
    producto: { findMany: vi.fn() },
  };
  const cae = { autorizar: vi.fn() };
  let service: CaePendientesService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.venta.count.mockResolvedValue(0);
    prisma.venta.update.mockResolvedValue({});
    prisma.venta.findUnique.mockResolvedValue(null);
    prisma.itemVenta.findMany.mockResolvedValue([
      { productoId: 'p1', subtotal: new Decimal('1000') },
    ]);
    prisma.producto.findMany.mockResolvedValue([{ id: 'p1', tipoIva: 'IVA_21' }]);
    service = new CaePendientesService(
      prisma as never,
      cae as never,
      new DesgloseDeVentaService(prisma as never),
    );
  });

  it('sin pendientes no hace nada', async () => {
    prisma.venta.findMany.mockResolvedValue([]);
    const r = await service.reintentar();
    expect(r.autorizadas).toBe(0);
    expect(cae.autorizar).not.toHaveBeenCalled();
  });

  it('autoriza las pendientes y les guarda el CAE', async () => {
    prisma.venta.findMany.mockResolvedValue([venta('v1', haceDias(3))]);
    cae.autorizar.mockResolvedValue({
      cae: '75123456789012',
      caeFechaVto: new Date('2026-09-10'),
      numeroComprobante: 5,
      tipoComprobante: 'FacturaB',
    });

    const r = await service.reintentar();

    expect(r.autorizadas).toBe(1);
    const data = prisma.venta.update.mock.calls[0]?.[0]?.data;
    expect(data.cae).toBe('75123456789012');
    expect(data.estadoFiscal).toBe('AUTORIZADA');
    expect(data.motivoFiscal).toBeNull();
  });

  it('guarda el numero que asigno ARCA, no el provisorio', async () => {
    // Mientras estuvo pendiente, la venta llevo un numero provisorio del
    // servidor. El definitivo lo pone ARCA al autorizar, y puede ser otro:
    // dejar el viejo deja el comprobante con un numero y el CAE
    // correspondiendo a otro.
    prisma.venta.findMany.mockResolvedValue([venta('v1', haceDias(1))]);
    cae.autorizar.mockResolvedValue({
      cae: '75123456789012',
      caeFechaVto: new Date('2026-09-10'),
      numeroComprobante: 7,
      tipoComprobante: 'FacturaB',
    });

    await service.reintentar();

    expect(prisma.venta.update.mock.calls[0]?.[0]?.data.numeroComprobante).toBe(7);
  });

  it('manda el desglose de IVA reconstruido, no sólo el total', async () => {
    // Sin esto, una pendiente se reintentaría con IVA en cero: ARCA la
    // rechazaría, y si la aceptara sería una factura mal emitida.
    const emitida = haceDias(3);
    prisma.venta.findMany.mockResolvedValue([venta('v1', emitida)]);
    cae.autorizar.mockResolvedValue({
      cae: '75123456789012',
      caeFechaVto: new Date('2026-09-10'),
      numeroComprobante: 5,
      tipoComprobante: 'FacturaB',
    });

    await service.reintentar();

    const solicitud = cae.autorizar.mock.calls[0]?.[0];
    expect(solicitud.total).toBe('1000.00');
    expect(solicitud.neto).toBe('826.45'); // 1000 - 173.55
    expect(solicitud.iva).toBe('173.55'); // 1000 × 21 / 121
    expect(solicitud.renglonesIva).toEqual([
      { codigoArca: 5, base: '826.45', importe: '173.55' },
    ]);
    expect(solicitud.codigoComprobante).toBe(6); // Factura B
    // La fecha es la de la venta, no la del reintento: es la que ya salió
    // impresa en el ticket del cliente.
    expect(solicitud.fecha).toEqual(emitida);
  });

  it('las pide EN ORDEN de emisión', async () => {
    // ARCA valida que la numeración sea correlativa: si se autoriza una
    // posterior antes que una anterior, la anterior ya no entra nunca.
    prisma.venta.findMany.mockResolvedValue([]);
    await service.reintentar();
    expect(prisma.venta.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { creadaEn: 'asc' } }),
    );
  });

  it('si ARCA sigue caída, FRENA y no sigue con las siguientes', async () => {
    prisma.venta.findMany.mockResolvedValue([
      venta('v1', haceDias(3)),
      venta('v2', haceDias(2)),
      venta('v3', haceDias(1)),
    ]);
    cae.autorizar.mockRejectedValue(new ErrorCaeNoDisponible('sin respuesta'));

    const r = await service.reintentar();

    // Una sola llamada: corta en la primera que falla por red.
    expect(cae.autorizar).toHaveBeenCalledTimes(1);
    expect(r.autorizadas).toBe(0);
  });

  it('autoriza hasta que ARCA se cae, y ahí frena', async () => {
    prisma.venta.findMany.mockResolvedValue([
      venta('v1', haceDias(3)),
      venta('v2', haceDias(2)),
      venta('v3', haceDias(1)),
    ]);
    cae.autorizar
      .mockResolvedValueOnce({
        cae: '1',
        caeFechaVto: new Date(),
        numeroComprobante: 1,
        tipoComprobante: 'FacturaB',
      })
      .mockRejectedValueOnce(new ErrorCaeNoDisponible('se cayó'));

    const r = await service.reintentar();

    expect(r.autorizadas).toBe(1);
    expect(cae.autorizar).toHaveBeenCalledTimes(2);
  });

  it('un RECHAZO no frena a las que vienen atrás, pero no se reintenta', async () => {
    prisma.venta.findMany.mockResolvedValue([
      venta('v1', haceDias(3)),
      venta('v2', haceDias(2)),
    ]);
    cae.autorizar
      .mockRejectedValueOnce(new ErrorCaeRechazado('CUIT del receptor inválido', '10015'))
      .mockResolvedValueOnce({
        cae: '2',
        caeFechaVto: new Date(),
        numeroComprobante: 2,
        tipoComprobante: 'FacturaB',
      });

    const r = await service.reintentar();

    expect(r.rechazadas).toBe(1);
    expect(r.autorizadas).toBe(1);
    const rechazo = prisma.venta.update.mock.calls[0]?.[0]?.data;
    expect(rechazo.estadoFiscal).toBe('RECHAZADA');
    expect(rechazo.motivoFiscal).toContain('CUIT del receptor inválido');
  });

  it('cuenta los intentos, para poder ver las que se trabaron', async () => {
    prisma.venta.findMany.mockResolvedValue([venta('v1', haceDias(3))]);
    cae.autorizar.mockRejectedValue(new ErrorCaeNoDisponible('sin red'));

    await service.reintentar();

    const data = prisma.venta.update.mock.calls[0]?.[0]?.data;
    expect(data.intentosCae).toEqual({ increment: 1 });
    expect(data.ultimoIntentoCae).toBeInstanceOf(Date);
  });

  it('no se pisa consigo mismo si la corrida anterior sigue viva', async () => {
    let resolver: (() => void) | undefined;
    prisma.venta.findMany.mockImplementation(
      () => new Promise((res) => { resolver = () => res([]); }),
    );

    const primera = service.reintentar();
    const segunda = await service.reintentar();

    expect(segunda.autorizadas).toBe(0);
    expect(prisma.venta.findMany).toHaveBeenCalledTimes(1);
    resolver?.();
    await primera;
  });

  it('un error inesperado se propaga, no se traga', async () => {
    prisma.venta.findMany.mockResolvedValue([venta('v1', haceDias(3))]);
    cae.autorizar.mockRejectedValue(new Error('bug de programación'));

    await expect(service.reintentar()).rejects.toThrow('bug de programación');
  });

  describe('pendientes que se pasaron del plazo de ARCA', () => {
    it('una de más de 5 días no se manda: sería un rechazo seguro', async () => {
      prisma.venta.findMany.mockResolvedValue([venta('v1', haceDias(9))]);

      const r = await service.reintentar();

      expect(cae.autorizar).not.toHaveBeenCalled();
      expect(r.rechazadas).toBe(1);
      const data = prisma.venta.update.mock.calls[0]?.[0]?.data;
      expect(data.estadoFiscal).toBe('RECHAZADA');
      expect(data.motivoFiscal).toContain('hace 9 días');
    });

    it('no frena a las que sí están en plazo', async () => {
      // Una vieja sin arreglo no puede dejar sin autorizar a las de hoy.
      prisma.venta.findMany.mockResolvedValue([venta('vieja', haceDias(9)), venta('nueva', haceDias(1))]);
      cae.autorizar.mockResolvedValue({
        cae: '1',
        caeFechaVto: new Date(),
        numeroComprobante: 1,
        tipoComprobante: 'FacturaB',
      });

      const r = await service.reintentar();

      expect(r.rechazadas).toBe(1);
      expect(r.autorizadas).toBe(1);
      expect(cae.autorizar).toHaveBeenCalledTimes(1);
    });
  });

  describe('notas de crédito pendientes', () => {
    it('mandan el comprobante que corrigen, que ARCA exige', async () => {
      prisma.venta.findMany.mockResolvedValue([
        venta('nc1', haceDias(1), {
          tipoComprobante: 'NotaCreditoB',
          comprobanteAsociadoId: 'v-original',
        }),
      ]);
      prisma.venta.findUnique.mockResolvedValue({
        tipoComprobante: 'FacturaB',
        numeroComprobante: 41,
      });
      cae.autorizar.mockResolvedValue({
        cae: '1',
        caeFechaVto: new Date(),
        numeroComprobante: 7,
        tipoComprobante: 'NotaCreditoB',
      });

      await service.reintentar();

      const solicitud = cae.autorizar.mock.calls[0]?.[0];
      expect(solicitud.comprobantesAsociados).toEqual([{ codigoComprobante: 6, numero: 41 }]);
    });

    it('una factura común no manda nada de eso', async () => {
      prisma.venta.findMany.mockResolvedValue([venta('v1', haceDias(1))]);
      cae.autorizar.mockResolvedValue({
        cae: '1',
        caeFechaVto: new Date(),
        numeroComprobante: 1,
        tipoComprobante: 'FacturaB',
      });

      await service.reintentar();

      expect(cae.autorizar.mock.calls[0]?.[0]).not.toHaveProperty('comprobantesAsociados');
    });
  });
});
