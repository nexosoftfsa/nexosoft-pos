import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { VentasService, notaCreditoDe } from './ventas.service';
import { LibroDeVentasEnMemoria } from './libro/libro-de-ventas-en-memoria';

function ventaConItems(overrides: Record<string, unknown> = {}) {
  return {
    id: 'v1',
    operacionId: 'op-1',
    estado: 'COMPLETADA',
    subtotal: new Decimal('200'),
    descuento: new Decimal('0'),
    total: new Decimal('200'),
    medioPago: 'EFECTIVO',
    tipoComprobante: 'FacturaB',
    numeroComprobante: 7,
    sucursalId: 's1',
    usuarioId: 'u1',
    terminalId: null,
    items: [
      { id: 'i1', cantidad: new Decimal('2'), precioUnitario: new Decimal('100'), descuento: new Decimal('0'), subtotal: new Decimal('200'), productoId: 'p1' },
    ],
    ...overrides,
  };
}

describe('notaCreditoDe', () => {
  it('hereda la letra de la factura', () => {
    expect(notaCreditoDe('FacturaA')).toBe('NotaCreditoA');
    expect(notaCreditoDe('FacturaB')).toBe('NotaCreditoB');
    expect(notaCreditoDe('FacturaC')).toBe('NotaCreditoC');
  });
  it('cae a NotaCreditoB si no reconoce el tipo', () => {
    expect(notaCreditoDe(null)).toBe('NotaCreditoB');
    expect(notaCreditoDe('Recibo')).toBe('NotaCreditoB');
  });
});

describe('VentasService.anular', () => {
  let prisma: {
    venta: { findFirst: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let tx: {
    venta: { create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    movimientoStock: { create: ReturnType<typeof vi.fn> };
  };
  let cae: { autorizar: ReturnType<typeof vi.fn> };
  let service: VentasService;

  beforeEach(() => {
    tx = {
      venta: { create: vi.fn().mockResolvedValue({ id: 'nc1', items: [] }), update: vi.fn().mockResolvedValue({}) },
      movimientoStock: { create: vi.fn().mockResolvedValue({}) },
    };
    prisma = {
      venta: { findFirst: vi.fn().mockResolvedValue(ventaConItems()) },
      $transaction: vi.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
    };
    cae = {
      autorizar: vi.fn().mockResolvedValue({
        cae: '99999999999999',
        caeFechaVto: new Date('2026-07-12'),
        numeroComprobante: 8,
        tipoComprobante: 'NotaCreditoB',
      }),
    };
    service = new VentasService(
      prisma as never,
      cae as never,
      new LibroDeVentasEnMemoria() as never,
      { crearRespaldo: vi.fn() } as never,
      { get: vi.fn() } as never,
    );
  });

  it('emite la NC con comprobante asociado, restaura stock y marca ANULADA', async () => {
    await service.anular('s1', 'v1');

    const ncData = tx.venta.create.mock.calls[0]![0].data;
    expect(ncData.comprobanteAsociadoId).toBe('v1');
    expect(ncData.tipoComprobante).toBe('NotaCreditoB');

    expect(tx.movimientoStock.create).toHaveBeenCalledOnce();
    expect(tx.movimientoStock.create.mock.calls[0]![0].data.tipo).toBe('ENTRADA');

    expect(tx.venta.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'v1' }, data: { estado: 'ANULADA' } }),
    );
  });

  it('pide el CAE para la Nota de Crédito con la letra heredada', async () => {
    await service.anular('s1', 'v1');
    expect(cae.autorizar).toHaveBeenCalledWith(
      expect.objectContaining({ tipoComprobante: 'NotaCreditoB', total: '200' }),
    );
  });

  it('rechaza anular un comprobante ya anulado', async () => {
    prisma.venta.findFirst.mockResolvedValue(ventaConItems({ estado: 'ANULADA' }));
    await expect(service.anular('s1', 'v1')).rejects.toThrow(BadRequestException);
  });

  it('rechaza anular una Nota de Crédito', async () => {
    prisma.venta.findFirst.mockResolvedValue(ventaConItems({ tipoComprobante: 'NotaCreditoB' }));
    await expect(service.anular('s1', 'v1')).rejects.toThrow(BadRequestException);
  });
});
