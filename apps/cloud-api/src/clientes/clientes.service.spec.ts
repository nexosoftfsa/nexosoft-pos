import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { ClientesService } from './clientes.service';

const mockCliente = { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() };
const mockMov = { findMany: vi.fn(), create: vi.fn() };
const mockPrisma = { cliente: mockCliente, movimientoCuentaCorriente: mockMov };

const SUCURSAL = 's1';
const ID = 'c1';

function cliente(overrides: Record<string, unknown> = {}) {
  return { id: ID, nombre: 'Kiosco Ana', limiteCredito: new Decimal('0'), sucursalId: SUCURSAL, ...overrides };
}

describe('ClientesService', () => {
  let service: ClientesService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ClientesService(mockPrisma as never);
  });

  describe('obtenerCliente / saldo', () => {
    it('lanza NotFound si no existe', async () => {
      mockCliente.findFirst.mockResolvedValue(null);
      await expect(service.obtenerCliente(SUCURSAL, ID)).rejects.toThrow(NotFoundException);
    });

    it('saldo = ΣCARGO − ΣPAGO', async () => {
      mockCliente.findFirst.mockResolvedValue(cliente());
      mockMov.findMany.mockResolvedValue([
        { tipo: 'CARGO', monto: new Decimal('1000') },
        { tipo: 'PAGO', monto: new Decimal('400') },
      ]);
      const res = await service.obtenerCliente(SUCURSAL, ID);
      expect(res.saldo).toBe('600.00');
    });
  });

  describe('registrarCargo', () => {
    it('lanza BadRequest si el monto es <= 0', async () => {
      mockCliente.findFirst.mockResolvedValue(cliente());
      await expect(service.registrarCargo(SUCURSAL, ID, { monto: '0' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lanza Conflict si el cargo supera el límite de crédito', async () => {
      mockCliente.findFirst.mockResolvedValue(cliente({ limiteCredito: new Decimal('1000') }));
      mockMov.findMany.mockResolvedValue([{ tipo: 'CARGO', monto: new Decimal('800') }]); // saldo 800
      await expect(service.registrarCargo(SUCURSAL, ID, { monto: '300' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('registra el cargo si está dentro del límite (o sin límite)', async () => {
      mockCliente.findFirst.mockResolvedValue(cliente()); // límite 0 = sin límite
      mockMov.findMany.mockResolvedValue([]);
      mockMov.create.mockResolvedValue({});
      await service.registrarCargo(SUCURSAL, ID, { monto: '500', concepto: 'Fiado' });
      expect(mockMov.create).toHaveBeenCalledOnce();
      expect(mockMov.create.mock.calls[0]![0].data.tipo).toBe('CARGO');
    });
  });

  describe('registrarPago', () => {
    it('lanza BadRequest si el monto es <= 0', async () => {
      mockCliente.findFirst.mockResolvedValue(cliente());
      mockMov.findMany.mockResolvedValue([]);
      await expect(service.registrarPago(SUCURSAL, ID, { monto: '-5' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('registra el pago como PAGO', async () => {
      mockCliente.findFirst.mockResolvedValue(cliente());
      mockMov.findMany.mockResolvedValue([]);
      mockMov.create.mockResolvedValue({});
      await service.registrarPago(SUCURSAL, ID, { monto: '300' });
      expect(mockMov.create.mock.calls[0]![0].data.tipo).toBe('PAGO');
    });
  });
});
