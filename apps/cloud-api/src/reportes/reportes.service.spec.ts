import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'node:path';
import { NotFoundException } from '@nestjs/common';
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

const mockConfig = { get: vi.fn() };

const SUCURSAL = 's1';
const RANGO = { desde: '2026-06-01', hasta: '2026-06-30' };

describe('ReportesService', () => {
  let service: ReportesService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ReportesService(mockPrisma as never, mockConfig as never);
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
      // Medianoche del día local AR = 03:00 UTC (huso -3).
      expect(where.creadaEn.gte.toISOString()).toBe('2026-06-01T03:00:00.000Z');
      // hasta inclusive: el lt es la medianoche AR del día siguiente.
      expect(where.creadaEn.lt.toISOString()).toBe('2026-07-01T03:00:00.000Z');
    });

    it('usa los últimos 30 días (hora AR) cuando no se pasa rango', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-28T15:00:00.000Z')); // 12:00 en AR → día 28
      mockVenta.findMany.mockResolvedValue([]);

      await service.resumenVentas(SUCURSAL, {});

      const where = mockVenta.findMany.mock.calls[0][0].where;
      expect(where.creadaEn.gte.toISOString()).toBe('2026-05-29T03:00:00.000Z');
      expect(where.creadaEn.lt.toISOString()).toBe('2026-06-29T03:00:00.000Z');
      vi.useRealTimers();
    });

    it('incluye una venta de la noche AR en el filtro "hasta ese día" (fix huso)', async () => {
      mockVenta.findMany.mockResolvedValue([]);
      // Venta del 29/06 23:30 AR = 30/06 02:30 UTC. Con "hasta 2026-06-29" debe entrar.
      await service.resumenVentas(SUCURSAL, { desde: '2026-06-29', hasta: '2026-06-29' });
      const where = mockVenta.findMany.mock.calls[0][0].where;
      const ventaNocturna = new Date('2026-06-30T02:30:00.000Z');
      expect(ventaNocturna >= where.creadaEn.gte && ventaNocturna < where.creadaEn.lt).toBe(true);
    });
  });

  describe('rango con hora (calcularRango)', () => {
    it('con desde/hasta con hora, usa el instante exacto en AR sin sumar un día', async () => {
      mockVenta.findMany.mockResolvedValue([]);
      await service.resumenVentas(SUCURSAL, {
        desde: '2026-08-15T09:00',
        hasta: '2026-08-15T13:00',
      });
      const where = mockVenta.findMany.mock.calls[0][0].where;
      expect(where.creadaEn.gte.toISOString()).toBe('2026-08-15T12:00:00.000Z'); // 09:00 AR
      expect(where.creadaEn.lt.toISOString()).toBe('2026-08-15T16:00:00.000Z'); // 13:00 AR, sin +1 día
    });

    it('solo "hasta" con hora: "desde" sin hora sigue siendo la medianoche AR de ese día', async () => {
      mockVenta.findMany.mockResolvedValue([]);
      await service.resumenVentas(SUCURSAL, { desde: '2026-08-15', hasta: '2026-08-15T18:30' });
      const where = mockVenta.findMany.mock.calls[0][0].where;
      expect(where.creadaEn.gte.toISOString()).toBe('2026-08-15T03:00:00.000Z');
      expect(where.creadaEn.lt.toISOString()).toBe('2026-08-15T21:30:00.000Z');
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

  describe('rentabilidad', () => {
    it('calcula ganancia bruta con el costoUnitario snapshot del ítem', async () => {
      mockItemVenta.findMany.mockResolvedValue([
        {
          cantidad: new Decimal('2'),
          subtotal: new Decimal('200.00'),
          costoUnitario: new Decimal('60.00'),
          producto: { precioCosto: new Decimal('999.00') }, // no debe usarse: hay snapshot
        },
        {
          cantidad: new Decimal('1'),
          subtotal: new Decimal('50.00'),
          costoUnitario: new Decimal('20.00'),
          producto: { precioCosto: new Decimal('999.00') },
        },
      ]);

      const r = await service.rentabilidad(SUCURSAL, RANGO);

      // ventas: 200+50=250 | costo: 2*60 + 1*20 = 140 | ganancia: 110
      expect(r.ventasTotal).toBe('250.00');
      expect(r.costoTotal).toBe('140.00');
      expect(r.gananciaBruta).toBe('110.00');
    });

    it('usa el costo ACTUAL del producto como fallback cuando falta el snapshot (ventas previas al ADR-0048)', async () => {
      mockItemVenta.findMany.mockResolvedValue([
        {
          cantidad: new Decimal('3'),
          subtotal: new Decimal('300.00'),
          costoUnitario: null,
          producto: { precioCosto: new Decimal('50.00') },
        },
      ]);

      const r = await service.rentabilidad(SUCURSAL, RANGO);

      // costo: 3*50 (fallback al precioCosto actual) = 150 | ganancia: 150
      expect(r.costoTotal).toBe('150.00');
      expect(r.gananciaBruta).toBe('150.00');
    });

    it('devuelve ceros sin ventas en el período', async () => {
      mockItemVenta.findMany.mockResolvedValue([]);
      const r = await service.rentabilidad(SUCURSAL, RANGO);
      expect(r).toEqual({ ventasTotal: '0.00', costoTotal: '0.00', gananciaBruta: '0.00' });
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

  describe('libro de ventas', () => {
    it('arma la ruta por defecto bajo la carpeta de respaldo', () => {
      mockConfig.get.mockReturnValue(undefined);
      expect(service.rutaLibroVentas()).toBe(join('./respaldos', 'ventas.xlsx'));
    });

    it('respeta LIBRO_VENTAS_ARCHIVO si está configurado', () => {
      mockConfig.get.mockImplementation((clave: string) =>
        clave === 'LIBRO_VENTAS_ARCHIVO' ? '/data/libro.xlsx' : undefined,
      );
      expect(service.rutaLibroVentas()).toBe('/data/libro.xlsx');
    });

    it('lanza NotFoundException si el archivo no existe', async () => {
      mockConfig.get.mockImplementation((clave: string) =>
        clave === 'LIBRO_VENTAS_ARCHIVO'
          ? join('ruta', 'inexistente', 'ventas.xlsx')
          : undefined,
      );
      await expect(service.abrirLibroDeVentas()).rejects.toThrow(NotFoundException);
    });
  });
});
