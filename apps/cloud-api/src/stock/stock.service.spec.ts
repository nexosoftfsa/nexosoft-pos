import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { StockService } from './stock.service';

const mockProducto = { findFirst: vi.fn(), findMany: vi.fn() };
const mockMovimiento = { findMany: vi.fn(), create: vi.fn() };
const mockPrisma = { producto: mockProducto, movimientoStock: mockMovimiento };

const SUCURSAL = 's1';
const PRODUCTO_ID = 'p1';
const PRODUCTO = { id: PRODUCTO_ID, nombre: 'Coca Cola', codigo: 'ABC' };

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
});
