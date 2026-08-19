import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { StockService } from './stock.service';
import { COLUMNAS_IMPORTAR_STOCK as COL } from './importar-stock-lote';

const mockProducto = { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() };
const mockMovimiento = { findMany: vi.fn(), create: vi.fn() };
const mockLote = { create: vi.fn(), findMany: vi.fn() };
const mockPrisma = {
  producto: mockProducto,
  movimientoStock: mockMovimiento,
  lote: mockLote,
  // El $transaction del servicio se usa de dos formas: con un array de
  // promesas (SALIDA por FEFO) y con una función interactiva (importarStock,
  // Fase 14.D) -- el mock soporta las dos.
  $transaction: vi.fn((opsOrCb: unknown) => {
    if (typeof opsOrCb === 'function') return (opsOrCb as (tx: unknown) => unknown)(mockPrisma);
    return Promise.all(opsOrCb as Promise<unknown>[]);
  }),
};

const SUCURSAL = 's1';
const PRODUCTO_ID = 'p1';
const PRODUCTO = { id: PRODUCTO_ID, nombre: 'Coca Cola', codigo: 'ABC' };
const PERECEDERO = { id: 'yog', nombre: 'Yogur', codigo: 'YOG', requiereLote: true };

describe('StockService', () => {
  let service: StockService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new StockService(mockPrisma as never);
  });

  describe('saldoPorProducto', () => {
    it('lanza NotFoundException si el producto no existe', async () => {
      mockProducto.findFirst.mockResolvedValue(null);
      await expect(service.saldoPorProducto(SUCURSAL, PRODUCTO_ID)).rejects.toThrow(NotFoundException);
    });

    it('calcula saldo correcto con entradas y salidas', async () => {
      mockProducto.findFirst.mockResolvedValue(PRODUCTO);
      mockMovimiento.findMany.mockResolvedValue([
        { tipo: 'ENTRADA', cantidad: new Decimal('10') },
        { tipo: 'SALIDA', cantidad: new Decimal('3') },
        { tipo: 'ENTRADA', cantidad: new Decimal('5') },
      ]);

      const result = await service.saldoPorProducto(SUCURSAL, PRODUCTO_ID);
      expect(result.saldo).toBe('12');
    });

    it('calcula saldo con ajuste sumando como entrada', async () => {
      mockProducto.findFirst.mockResolvedValue(PRODUCTO);
      mockMovimiento.findMany.mockResolvedValue([
        { tipo: 'AJUSTE', cantidad: new Decimal('20') },
        { tipo: 'VENTA', cantidad: new Decimal('7') },
      ]);

      const result = await service.saldoPorProducto(SUCURSAL, PRODUCTO_ID);
      expect(result.saldo).toBe('13');
    });
  });

  describe('registrarMovimiento', () => {
    it('lanza NotFoundException si el producto no existe', async () => {
      mockProducto.findFirst.mockResolvedValue(null);
      await expect(
        service.registrarMovimiento(SUCURSAL, {
          productoId: PRODUCTO_ID, tipo: 'ENTRADA', cantidad: '5',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException si cantidad <= 0', async () => {
      mockProducto.findFirst.mockResolvedValue(PRODUCTO);
      await expect(
        service.registrarMovimiento(SUCURSAL, {
          productoId: PRODUCTO_ID, tipo: 'ENTRADA', cantidad: '0',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException por stock insuficiente en SALIDA', async () => {
      mockProducto.findFirst.mockResolvedValue(PRODUCTO);
      // Saldo actual = 3
      mockMovimiento.findMany.mockResolvedValue([
        { tipo: 'ENTRADA', cantidad: new Decimal('3') },
      ]);

      await expect(
        service.registrarMovimiento(SUCURSAL, {
          productoId: PRODUCTO_ID, tipo: 'SALIDA', cantidad: '10',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('registra ENTRADA exitosamente', async () => {
      mockProducto.findFirst.mockResolvedValue(PRODUCTO);
      mockMovimiento.findMany.mockResolvedValue([]);
      mockMovimiento.create.mockResolvedValue({
        id: 'm1', tipo: 'ENTRADA', cantidad: new Decimal('5'),
        producto: PRODUCTO,
      });

      const result = await service.registrarMovimiento(SUCURSAL, {
        productoId: PRODUCTO_ID, tipo: 'ENTRADA', cantidad: '5',
      });

      expect(result.tipo).toBe('ENTRADA');
      expect(mockMovimiento.create).toHaveBeenCalledOnce();
    });

    it('registra SALIDA cuando hay stock suficiente', async () => {
      mockProducto.findFirst.mockResolvedValue(PRODUCTO);
      // Saldo = 10, salida = 4 → ok
      mockMovimiento.findMany.mockResolvedValue([
        { tipo: 'ENTRADA', cantidad: new Decimal('10') },
      ]);
      mockMovimiento.create.mockResolvedValue({
        id: 'm2', tipo: 'SALIDA', cantidad: new Decimal('4'),
        producto: PRODUCTO,
      });

      const result = await service.registrarMovimiento(SUCURSAL, {
        productoId: PRODUCTO_ID, tipo: 'SALIDA', cantidad: '4',
      });

      expect(result.tipo).toBe('SALIDA');
    });
  });

  describe('registrarMovimiento (lotes, Fase 8.2)', () => {
    it('ENTRADA de un perecedero abre un lote con vencimiento', async () => {
      mockProducto.findFirst.mockResolvedValue(PERECEDERO);
      mockLote.create.mockResolvedValue({ id: 'L1' });
      mockMovimiento.create.mockResolvedValue({
        id: 'm', tipo: 'ENTRADA', cantidad: new Decimal('12'), loteId: 'L1', producto: PERECEDERO,
      });

      const r = await service.registrarMovimiento(SUCURSAL, {
        productoId: 'yog', tipo: 'ENTRADA', cantidad: '12',
        fechaVencimiento: '2026-09-01', numeroLote: 'A1',
      });

      expect(mockLote.create).toHaveBeenCalledOnce();
      expect(mockLote.create.mock.calls[0]![0].data).toMatchObject({ productoId: 'yog', numero: 'A1' });
      expect(mockMovimiento.create.mock.calls[0]![0].data.loteId).toBe('L1');
      expect(r.loteId).toBe('L1');
    });

    it('rechaza ENTRADA de un perecedero sin fecha de vencimiento', async () => {
      mockProducto.findFirst.mockResolvedValue(PERECEDERO);
      await expect(
        service.registrarMovimiento(SUCURSAL, { productoId: 'yog', tipo: 'ENTRADA', cantidad: '5' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('SALIDA de un perecedero consume lotes por FEFO (vence antes primero)', async () => {
      mockProducto.findFirst.mockResolvedValue(PERECEDERO);
      mockLote.findMany.mockResolvedValue([
        { id: 'viejo', numero: null, fechaVencimiento: new Date('2026-08-01') },
        { id: 'nuevo', numero: null, fechaVencimiento: new Date('2026-12-01') },
      ]);
      mockMovimiento.findMany.mockResolvedValue([
        { loteId: 'viejo', tipo: 'ENTRADA', cantidad: new Decimal('4') },
        { loteId: 'nuevo', tipo: 'ENTRADA', cantidad: new Decimal('10') },
      ]);
      mockMovimiento.create.mockImplementation((args: { data: unknown }) =>
        Promise.resolve(args.data),
      );

      await service.registrarMovimiento(SUCURSAL, { productoId: 'yog', tipo: 'SALIDA', cantidad: '6' });

      const asignado = mockMovimiento.create.mock.calls.map((c) => [
        c[0].data.loteId,
        c[0].data.cantidad.toString(),
      ]);
      expect(asignado).toEqual([
        ['viejo', '4'],
        ['nuevo', '2'],
      ]);
    });

    it('rechaza SALIDA de un perecedero si los lotes no alcanzan', async () => {
      mockProducto.findFirst.mockResolvedValue(PERECEDERO);
      mockLote.findMany.mockResolvedValue([
        { id: 'l1', numero: null, fechaVencimiento: new Date('2026-08-01') },
      ]);
      mockMovimiento.findMany.mockResolvedValue([
        { loteId: 'l1', tipo: 'ENTRADA', cantidad: new Decimal('2') },
      ]);
      await expect(
        service.registrarMovimiento(SUCURSAL, { productoId: 'yog', tipo: 'SALIDA', cantidad: '5' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('vencimientos', () => {
    it('lista solo lotes con saldo > 0 vencidos o próximos a vencer', async () => {
      mockProducto.findMany.mockResolvedValue([PERECEDERO]);
      const hoy = Date.now();
      mockLote.findMany.mockResolvedValue([
        { id: 'venc', numero: 'V', fechaVencimiento: new Date(hoy - 2 * 86_400_000) },
        { id: 'lejos', numero: 'L', fechaVencimiento: new Date(hoy + 200 * 86_400_000) },
      ]);
      mockMovimiento.findMany.mockResolvedValue([
        { loteId: 'venc', tipo: 'ENTRADA', cantidad: new Decimal('3') },
        { loteId: 'lejos', tipo: 'ENTRADA', cantidad: new Decimal('5') },
      ]);

      const r = await service.vencimientos(SUCURSAL, 30);
      expect(r).toHaveLength(1);
      expect(r[0]!.loteId).toBe('venc');
      expect(r[0]!.vencido).toBe(true);
      expect(r[0]!.saldo).toBe('3');
    });
  });

  describe('importarStock (Fase 14.D)', () => {
    function filaCruda(overrides: Record<string, string> = {}): Record<string, string> {
      return { [COL.codigo]: 'ABC', [COL.cantidad]: '25', [COL.fechaVencimiento]: '', [COL.motivo]: '', ...overrides };
    }

    beforeEach(() => {
      mockProducto.findUnique.mockResolvedValue(PRODUCTO);
      mockMovimiento.create.mockResolvedValue({ id: 'm1' });
      mockLote.create.mockResolvedValue({ id: 'L1' });
    });

    it('carga stock de un producto simple (sin lote)', async () => {
      const resultados = await service.importarStock(SUCURSAL, [filaCruda()], false);
      expect(resultados).toEqual([{ fila: 2, resultado: 'creada' }]);
      expect(mockMovimiento.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tipo: 'ENTRADA',
          cantidad: '25',
          productoId: PRODUCTO_ID,
          motivo: 'Importación de stock',
          loteId: null,
        }),
      });
      expect(mockLote.create).not.toHaveBeenCalled();
    });

    it('un producto perecedero abre un lote si trae fecha de vencimiento', async () => {
      mockProducto.findUnique.mockResolvedValue(PERECEDERO);
      const resultados = await service.importarStock(
        SUCURSAL,
        [filaCruda({ [COL.codigo]: 'YOG', [COL.fechaVencimiento]: '2027-05-01' })],
        false,
      );
      expect(resultados).toEqual([{ fila: 2, resultado: 'creada' }]);
      expect(mockLote.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ productoId: PERECEDERO.id, fechaVencimiento: new Date('2027-05-01') }),
      });
      expect(mockMovimiento.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ loteId: 'L1' }),
      });
    });

    it('un producto perecedero sin fecha de vencimiento da error de fila, no crea nada', async () => {
      mockProducto.findUnique.mockResolvedValue(PERECEDERO);
      const resultados = await service.importarStock(SUCURSAL, [filaCruda({ [COL.codigo]: 'YOG' })], false);
      expect(resultados[0]!.resultado).toBe('error');
      expect(resultados[0]).toMatchObject({ mensaje: expect.stringContaining('perecedero') });
      expect(mockMovimiento.create).not.toHaveBeenCalled();
    });

    it('código que no existe en la sucursal da error de fila', async () => {
      mockProducto.findUnique.mockResolvedValue(null);
      const resultados = await service.importarStock(SUCURSAL, [filaCruda({ [COL.codigo]: 'NOEXISTE' })], false);
      expect(resultados[0]).toMatchObject({ resultado: 'error', mensaje: expect.stringContaining('NOEXISTE') });
    });

    it('una fila con error no aborta el resto del lote', async () => {
      const filas = [filaCruda({ [COL.cantidad]: 'no-es-numero' }), filaCruda({ [COL.codigo]: 'DEF' })];
      const resultados = await service.importarStock(SUCURSAL, filas, false);
      expect(resultados[0]!.resultado).toBe('error');
      expect(resultados[1]).toEqual({ fila: 3, resultado: 'creada' });
    });

    it('dry-run devuelve el mismo reporte (atrapa el sentinel RevertirDryRun)', async () => {
      const resultados = await service.importarStock(SUCURSAL, [filaCruda()], true);
      expect(resultados).toEqual([{ fila: 2, resultado: 'creada' }]);
    });
  });
});
