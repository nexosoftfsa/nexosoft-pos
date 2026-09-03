import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';

import { VentasService } from './ventas.service';
import { LibroDeVentasEnMemoria } from './libro/libro-de-ventas-en-memoria';
import { DesgloseDeVentaService } from './cae/desglose-de-venta.service';

/**
 * Una Nota de Débito es la contracara de la anulación y las diferencias
 * importan: no anula el original, sale por su propio monto, no mueve stock y
 * suma a la cuenta corriente si la venta era fiada.
 */
function facturaOriginal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'v1',
    operacionId: 'op-1',
    estado: 'COMPLETADA',
    subtotal: new Decimal('1000'),
    descuento: new Decimal('0'),
    total: new Decimal('1000'),
    medioPago: 'EFECTIVO',
    tipoComprobante: 'FacturaA',
    numeroComprobante: 7,
    sucursalId: 's1',
    usuarioId: 'u1',
    terminalId: null,
    clienteId: 'cli-1',
    items: [
      {
        id: 'i1',
        cantidad: new Decimal('1'),
        precioUnitario: new Decimal('1000'),
        descuento: new Decimal('0'),
        subtotal: new Decimal('1000'),
        productoId: 'p1',
      },
    ],
    ...overrides,
  };
}

describe('VentasService.emitirNotaDebito', () => {
  let prisma: {
    venta: { findFirst: ReturnType<typeof vi.fn> };
    producto: { findMany: ReturnType<typeof vi.fn> };
    cliente: { findUnique: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let tx: {
    venta: { create: ReturnType<typeof vi.fn>; aggregate: ReturnType<typeof vi.fn> };
    movimientoStock: { create: ReturnType<typeof vi.fn> };
    movimientoCuentaCorriente: { create: ReturnType<typeof vi.fn> };
  };
  let cae: { autorizar: ReturnType<typeof vi.fn> };
  let service: VentasService;

  beforeEach(() => {
    tx = {
      venta: {
        create: vi.fn().mockResolvedValue({ id: 'nd1', items: [] }),
        aggregate: vi.fn().mockResolvedValue({ _max: { numeroComprobante: null } }),
      },
      movimientoStock: { create: vi.fn().mockResolvedValue({}) },
      movimientoCuentaCorriente: { create: vi.fn().mockResolvedValue({}) },
    };
    prisma = {
      venta: { findFirst: vi.fn().mockResolvedValue(facturaOriginal()) },
      producto: { findMany: vi.fn().mockResolvedValue([{ id: 'p1', tipoIva: 'IVA_21' }]) },
      cliente: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ documento: '30712345670', condicionIva: 'RESPONSABLE_INSCRIPTO' }),
      },
      $transaction: vi.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
    };
    cae = {
      autorizar: vi.fn().mockResolvedValue({
        cae: '99999999999999',
        caeFechaVto: new Date('2026-09-13'),
        numeroComprobante: 3,
        tipoComprobante: 'NotaDebitoA',
      }),
    };
    service = new VentasService(
      prisma as never,
      cae as never,
      new LibroDeVentasEnMemoria() as never,
      { crearRespaldo: vi.fn() } as never,
      { get: vi.fn() } as never,
      new DesgloseDeVentaService(prisma as never),
    );
  });

  it('hereda la letra del original y sale por SU monto, no por el de la factura', async () => {
    await service.emitirNotaDebito('s1', 'v1', { monto: '121', concepto: 'Intereses' });

    const data = tx.venta.create.mock.calls[0]![0].data;
    expect(data.tipoComprobante).toBe('NotaDebitoA');
    expect(data.total.toString()).toBe('121');
    // El original vale 1000: la nota NO lo copia.
    expect(data.total.toString()).not.toBe('1000');
  });

  it('NO anula el original ni le toca el estado', async () => {
    await service.emitirNotaDebito('s1', 'v1', { monto: '121', concepto: 'Intereses' });

    // `anular` hace un tx.venta.update para marcar ANULADA; acá no debe haberlo.
    expect((tx.venta as Record<string, unknown>)['update']).toBeUndefined();
  });

  it('no mueve stock: no hay mercadería, es plata', async () => {
    await service.emitirNotaDebito('s1', 'v1', { monto: '121', concepto: 'Intereses' });
    expect(tx.movimientoStock.create).not.toHaveBeenCalled();
  });

  it('guarda el concepto, que es la única línea que va a mostrar el papel', async () => {
    await service.emitirNotaDebito('s1', 'v1', {
      monto: '121',
      concepto: 'Intereses por pago fuera de término',
    });
    expect(tx.venta.create.mock.calls[0]![0].data.conceptoLibre).toBe(
      'Intereses por pago fuera de término',
    );
  });

  it('le manda a ARCA el comprobante que corrige: sin CbtesAsoc lo rechaza', async () => {
    await service.emitirNotaDebito('s1', 'v1', { monto: '121', concepto: 'Intereses' });

    const solicitud = cae.autorizar.mock.calls[0]![0];
    expect(solicitud.comprobantesAsociados).toEqual([
      expect.objectContaining({ numero: 7 }),
    ]);
  });

  it('el desglose que va a ARCA es el del monto de la NOTA', async () => {
    await service.emitirNotaDebito('s1', 'v1', { monto: '121', concepto: 'Intereses' });

    const solicitud = cae.autorizar.mock.calls[0]![0];
    expect(solicitud.total).toBe('121.00');
    expect(solicitud.neto).toBe('100.00');
    expect(solicitud.iva).toBe('21.00');
  });

  describe('cuenta corriente', () => {
    it('una venta fiada suma la deuda: el cliente ahora debe más', async () => {
      prisma.venta.findFirst.mockResolvedValue(
        facturaOriginal({ medioPago: 'CUENTA_CORRIENTE' }),
      );

      await service.emitirNotaDebito('s1', 'v1', { monto: '121', concepto: 'Intereses' });

      const mov = tx.movimientoCuentaCorriente.create.mock.calls[0]![0].data;
      expect(mov.tipo).toBe('CARGO');
      expect(mov.monto.toString()).toBe('121');
      expect(mov.clienteId).toBe('cli-1');
    });

    it('una venta en efectivo no toca la cuenta corriente', async () => {
      await service.emitirNotaDebito('s1', 'v1', { monto: '121', concepto: 'Intereses' });
      expect(tx.movimientoCuentaCorriente.create).not.toHaveBeenCalled();
    });
  });

  describe('lo que no se puede debitar', () => {
    it('un ticket no fiscal: no es un comprobante ante ARCA', async () => {
      prisma.venta.findFirst.mockResolvedValue(
        facturaOriginal({ tipoComprobante: 'TicketNoFiscal' }),
      );
      await expect(
        service.emitirNotaDebito('s1', 'v1', { monto: '121', concepto: 'X' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('otra nota: no se apilan', async () => {
      prisma.venta.findFirst.mockResolvedValue(
        facturaOriginal({ tipoComprobante: 'NotaCreditoA' }),
      );
      await expect(
        service.emitirNotaDebito('s1', 'v1', { monto: '121', concepto: 'X' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('un comprobante anulado: la operación se dio de baja', async () => {
      prisma.venta.findFirst.mockResolvedValue(facturaOriginal({ estado: 'ANULADA' }));
      await expect(
        service.emitirNotaDebito('s1', 'v1', { monto: '121', concepto: 'X' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('monto cero o negativo', async () => {
      await expect(
        service.emitirNotaDebito('s1', 'v1', { monto: '0', concepto: 'X' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.emitirNotaDebito('s1', 'v1', { monto: '-50', concepto: 'X' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  /**
   * A diferencia de la NC —una por venta— se pueden emitir varias notas de
   * débito sobre el mismo comprobante: los intereses de un mes, después los del
   * siguiente. Con un sufijo fijo la segunda chocaría contra el unique de
   * `operacionId`.
   */
  it('dos notas de débito sobre el mismo comprobante no chocan de operacionId', async () => {
    await service.emitirNotaDebito('s1', 'v1', { monto: '121', concepto: 'Mes 1' });
    await service.emitirNotaDebito('s1', 'v1', { monto: '242', concepto: 'Mes 2' });

    const primera = tx.venta.create.mock.calls[0]![0].data.operacionId;
    const segunda = tx.venta.create.mock.calls[1]![0].data.operacionId;
    expect(primera).not.toBe(segunda);
  });
});
