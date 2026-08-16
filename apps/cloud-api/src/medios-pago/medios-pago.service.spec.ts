import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { MediosPagoService } from './medios-pago.service';

const mockTarjeta = { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), findUniqueOrThrow: vi.fn() };
const mockTasa = { deleteMany: vi.fn(), createMany: vi.fn() };
const tx = { tarjetaConfig: mockTarjeta, tasaCuota: mockTasa };
const mockPrisma = {
  tarjetaConfig: mockTarjeta,
  tasaCuota: mockTasa,
  $transaction: vi.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
};

const SUCURSAL = 's1';
const ID = 't1';

function tarjeta(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    banco: 'Banco Galicia',
    tipo: 'CREDITO',
    marca: 'Visa',
    activo: true,
    sucursalId: SUCURSAL,
    tasas: [{ id: 'ta1', cantidadCuotas: 1, recargoPorcentaje: '0' }],
    ...overrides,
  };
}

describe('MediosPagoService', () => {
  let service: MediosPagoService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MediosPagoService(mockPrisma as never);
  });

  describe('listarTarjetas', () => {
    it('filtra por sucursal y activo=true por defecto, ordenado por banco, con tasas', async () => {
      mockTarjeta.findMany.mockResolvedValue([tarjeta()]);
      await service.listarTarjetas(SUCURSAL);
      const args = mockTarjeta.findMany.mock.calls[0]![0];
      expect(args.where).toEqual({ sucursalId: SUCURSAL, activo: true });
      expect(args.orderBy).toEqual({ banco: 'asc' });
      expect(args.include.tasas.orderBy).toEqual({ cantidadCuotas: 'asc' });
    });

    it('con soloActivas=false incluye inactivas', async () => {
      mockTarjeta.findMany.mockResolvedValue([]);
      await service.listarTarjetas(SUCURSAL, false);
      expect(mockTarjeta.findMany.mock.calls[0]![0].where).toEqual({ sucursalId: SUCURSAL });
    });
  });

  describe('obtenerTarjeta', () => {
    it('lanza NotFoundException si no existe', async () => {
      mockTarjeta.findFirst.mockResolvedValue(null);
      await expect(service.obtenerTarjeta(SUCURSAL, ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('crearTarjeta', () => {
    it('crea la tarjeta con sus tasas anidadas', async () => {
      mockTarjeta.create.mockResolvedValue(tarjeta());
      await service.crearTarjeta(SUCURSAL, {
        banco: 'Banco Galicia',
        tipo: 'CREDITO' as never,
        tasas: [
          { cantidadCuotas: 3, recargoPorcentaje: 10 },
          { cantidadCuotas: 6, recargoPorcentaje: 18 },
        ],
      });
      const data = mockTarjeta.create.mock.calls[0]![0].data;
      expect(data.banco).toBe('Banco Galicia');
      expect(data.sucursalId).toBe(SUCURSAL);
      expect(data.tasas.create).toHaveLength(2);
      expect(data.tasas.create[1]).toEqual({ cantidadCuotas: 6, recargoPorcentaje: 18 });
    });
  });

  describe('actualizarTarjeta', () => {
    it('lanza NotFoundException si no existe', async () => {
      mockTarjeta.findFirst.mockResolvedValue(null);
      await expect(
        service.actualizarTarjeta(SUCURSAL, ID, { banco: 'Nuevo banco' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('reemplaza el set completo de tasas cuando vienen en el dto', async () => {
      mockTarjeta.findFirst.mockResolvedValue(tarjeta());
      mockTarjeta.update.mockResolvedValue(tarjeta());
      mockTarjeta.findUniqueOrThrow.mockResolvedValue(tarjeta());

      await service.actualizarTarjeta(SUCURSAL, ID, {
        tasas: [{ cantidadCuotas: 12, recargoPorcentaje: 25 }],
      });

      expect(mockTasa.deleteMany).toHaveBeenCalledWith({ where: { tarjetaConfigId: ID } });
      expect(mockTasa.createMany.mock.calls[0]![0].data).toEqual([
        { cantidadCuotas: 12, recargoPorcentaje: 25, tarjetaConfigId: ID },
      ]);
    });

    it('no toca las tasas si el dto no las incluye', async () => {
      mockTarjeta.findFirst.mockResolvedValue(tarjeta());
      mockTarjeta.update.mockResolvedValue(tarjeta());
      mockTarjeta.findUniqueOrThrow.mockResolvedValue(tarjeta());

      await service.actualizarTarjeta(SUCURSAL, ID, { activo: false });

      expect(mockTasa.deleteMany).not.toHaveBeenCalled();
      expect(mockTasa.createMany).not.toHaveBeenCalled();
    });
  });

  describe('desactivarTarjeta', () => {
    it('hace soft-delete (activo: false), no borra la fila', async () => {
      mockTarjeta.findFirst.mockResolvedValue(tarjeta());
      mockTarjeta.update.mockResolvedValue(tarjeta({ activo: false }));
      await service.desactivarTarjeta(SUCURSAL, ID);
      const call = mockTarjeta.update.mock.calls[0]![0];
      expect(call.where).toEqual({ id: ID });
      expect(call.data).toEqual({ activo: false });
    });
  });
});
