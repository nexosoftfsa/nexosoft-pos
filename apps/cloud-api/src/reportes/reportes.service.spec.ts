import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';
import { ReportesService } from './reportes.service';

const mockVenta = { findMany: vi.fn() };
const mockItemVenta = { findMany: vi.fn() };
const mockProducto = { findMany: vi.fn() };
const mockMovimiento = { findMany: vi.fn() };
const mockPrisma = {
  venta: mockVenta,
  itemVenta: mockItemVenta,
  producto: mockProducto,
  movimientoStock: mockMovimiento,
};

const SUCURSAL = 's1';
const RANGO = { desde: '2026-06-01', hasta: '2026-06-30' };

describe('ReportesService', () => {
  let service: ReportesService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ReportesService(mockPrisma as never);
  });

  describe('resumenVentas', () => {
    it('suma totales y descuentos con dinero exacto y calcula el ticket promedio', async () => {
      mockVenta.findMany.mockResolvedValue([
        { total: new Decimal('100.50'), descuento: new Decimal('0') },
        { total: new Decimal('200.00'), descuento: new Decimal('10.00') },
        { total: new Decimal('99.50'), descuento: new Decimal('0') },
      ]);

      const r = await service.resumenVentas(SUCURSAL, RANGO);

      expect(r.cantidadVentas).toBe(3);
      expect(r.totalVendido).toBe('400.00');
      expect(r.totalDescuentos).toBe('10.00');
      expect(r.ticketPromedio).toBe('133.33');
    });

    it('devuelve ceros y no divide por cero sin ventas', async () => {
      mockVenta.findMany.mockResolvedValue([]);
      const r = await service.resumenVentas(SUCURSAL, RANGO);
      expect(r.cantidadVentas).toBe(0);
      expect(r.totalVendido).toBe('0.00');
      expect(r.ticketPromedio).toBe('0.00');
    });

    it('filtra por sucursal, estado COMPLETADA y rango de fechas (hasta inclusive)', async () => {
      mockVenta.findMany.mockResolvedValue([]);
      await service.resumenVentas(SUCURSAL, RANGO);

      const where = mockVenta.findMany.mock.calls[0][0].where;
      expect(where.sucursalId).toBe(SUCURSAL);
      expect(where.estado).toBe('COMPLETADA');
      expect(where.creadaEn.gte.toISOString()).toBe('2026-06-01T00:00:00.000Z');
      // hasta inclusive: el lt es el día siguiente a las 00:00
      expect(where.creadaEn.lt.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    });

    it('usa los últimos 30 días cuando no se pasa rango', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-28T15:00:00.000Z'));
      mockVenta.findMany.mockResolvedValue([]);

      await service.resumenVentas(SUCURSAL, {});

      const where = mockVenta.findMany.mock.calls[0][0].where;
      expect(where.creadaEn.gte.toISOString()).toBe('2026-05-29T00:00:00.000Z');
      expect(where.creadaEn.lt.toISOString()).toBe('2026-06-29T00:00:00.000Z');
      vi.useRealTimers();
    });
  });

  describe('serieDiaria', () => {
    it('agrupa ventas por día (UTC) sumando total y cantidad', async () => {
      mockVenta.findMany.mockResolvedValue([
        { total: new Decimal('100'), creadaEn: new Date('2026-06-01T10:00:00Z') },
        { total: new Decimal('50'), creadaEn: new Date('2026-06-01T20:00:00Z') },
        { total: new Decimal('30'), creadaEn: new Date('2026-06-02T09:00:00Z') },
      ]);

      const r = await service.serieDiaria(SUCURSAL, RANGO);

      expect(r).toEqual([
        { fecha: '2026-06-01', total: '150.00', cantidad: 2 },
        { fecha: '2026-06-02', total: '30.00', cantidad: 1 },
      ]);
    });
  });

  describe('porMedioPago', () => {
    it('agrupa por medio de pago y ordena por total descendente', async () => {
      mockVenta.findMany.mockResolvedValue([
        { total: new Decimal('100'), medioPago: 'EFECTIVO' },
        { total: new Decimal('300'), medioPago: 'TARJETA_CREDITO' },
        { total: new Decimal('50'), medioPago: 'EFECTIVO' },
      ]);

      const r = await service.porMedioPago(SUCURSAL, RANGO);

      expect(r).toEqual([
        { medioPago: 'TARJETA_CREDITO', total: '300.00', cantidad: 1 },
        { medioPago: 'EFECTIVO', total: '150.00', cantidad: 2 },
      ]);
    });
  });

  describe('porTerminal', () => {
    it('agrupa por terminal y trata las ventas sin terminal aparte', async () => {
      mockVenta.findMany.mockResolvedValue([
        { total: new Decimal('100'), terminalId: 't1', terminal: { nombre: 'Caja 1' } },
        { total: new Decimal('40'), terminalId: 't1', terminal: { nombre: 'Caja 1' } },
        { total: new Decimal('20'), terminalId: null, terminal: null },
      ]);

      const r = await service.porTerminal(SUCURSAL, RANGO);

      expect(r).toEqual([
        { terminalId: 't1', nombre: 'Caja 1', total: '140.00', cantidad: 2 },
        { terminalId: 'sin-terminal', nombre: 'Sin terminal', total: '20.00', cantidad: 1 },
      ]);
    });
  });

  describe('topProductos', () => {
    it('acumula cantidad y monto por producto, ordena y respeta el límite', async () => {
      mockItemVenta.findMany.mockResolvedValue([
        { productoId: 'p1', cantidad: new Decimal('2'), subtotal: new Decimal('200'), producto: { nombre: 'Coca', codigo: 'C1' } },
        { productoId: 'p2', cantidad: new Decimal('5'), subtotal: new Decimal('50'), producto: { nombre: 'Pan', codigo: 'P1' } },
        { productoId: 'p1', cantidad: new Decimal('1'), subtotal: new Decimal('100'), producto: { nombre: 'Coca', codigo: 'C1' } },
      ]);

      const r = await service.topProductos(SUCURSAL, RANGO, 1);

      expect(r).toEqual([
        { productoId: 'p2', nombre: 'Pan', codigo: 'P1', cantidad: '5', monto: '50.00' },
      ]);
    });
  });

  describe('stockBajo', () => {
    it('devuelve solo productos con saldo <= umbral, ordenados ascendente', async () => {
      mockProducto.findMany.mockResolvedValue([
        { id: 'p1', nombre: 'Coca', codigo: 'C1' },
        { id: 'p2', nombre: 'Pan', codigo: 'P1' },
      ]);
      mockMovimiento.findMany
        // p1: 10 - 8 = 2 (bajo)
        .mockResolvedValueOnce([
          { tipo: 'ENTRADA', cantidad: new Decimal('10') },
          { tipo: 'VENTA', cantidad: new Decimal('8') },
        ])
        // p2: 100 (no bajo)
        .mockResolvedValueOnce([{ tipo: 'ENTRADA', cantidad: new Decimal('100') }]);

      const r = await service.stockBajo(SUCURSAL, 5);

      expect(r).toEqual([{ producto: { id: 'p1', nombre: 'Coca', codigo: 'C1' }, saldo: '2' }]);
    });
  });
});
