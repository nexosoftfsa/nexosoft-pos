import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';

import { CaePendientesService } from './cae-pendientes.service';
import { ErrorCaeNoDisponible, ErrorCaeRechazado } from './servicio-cae';

function venta(id: string, creadaEn: string) {
  return {
    id,
    creadaEn: new Date(creadaEn),
    tipoComprobante: 'FacturaB',
    total: new Decimal('1000'),
    sucursalId: 's1',
  };
}

describe('CaePendientesService', () => {
  const prisma = {
    venta: { findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
  };
  const cae = { autorizar: vi.fn() };
  let service: CaePendientesService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.venta.count.mockResolvedValue(0);
    prisma.venta.update.mockResolvedValue({});
    service = new CaePendientesService(prisma as never, cae as never);
  });

  it('sin pendientes no hace nada', async () => {
    prisma.venta.findMany.mockResolvedValue([]);
    const r = await service.reintentar();
    expect(r.autorizadas).toBe(0);
    expect(cae.autorizar).not.toHaveBeenCalled();
  });

  it('autoriza las pendientes y les guarda el CAE', async () => {
    prisma.venta.findMany.mockResolvedValue([venta('v1', '2026-08-27T10:00:00Z')]);
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
      venta('v1', '2026-08-27T10:00:00Z'),
      venta('v2', '2026-08-27T11:00:00Z'),
      venta('v3', '2026-08-27T12:00:00Z'),
    ]);
    cae.autorizar.mockRejectedValue(new ErrorCaeNoDisponible('sin respuesta'));

    const r = await service.reintentar();

    // Una sola llamada: corta en la primera que falla por red.
    expect(cae.autorizar).toHaveBeenCalledTimes(1);
    expect(r.autorizadas).toBe(0);
  });

  it('autoriza hasta que ARCA se cae, y ahí frena', async () => {
    prisma.venta.findMany.mockResolvedValue([
      venta('v1', '2026-08-27T10:00:00Z'),
      venta('v2', '2026-08-27T11:00:00Z'),
      venta('v3', '2026-08-27T12:00:00Z'),
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
      venta('v1', '2026-08-27T10:00:00Z'),
      venta('v2', '2026-08-27T11:00:00Z'),
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
    prisma.venta.findMany.mockResolvedValue([venta('v1', '2026-08-27T10:00:00Z')]);
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
    prisma.venta.findMany.mockResolvedValue([venta('v1', '2026-08-27T10:00:00Z')]);
    cae.autorizar.mockRejectedValue(new Error('bug de programación'));

    await expect(service.reintentar()).rejects.toThrow('bug de programación');
  });
});
