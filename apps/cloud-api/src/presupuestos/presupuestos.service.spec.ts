import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PresupuestosService } from './presupuestos.service';

const mockPresupuesto = {
  findMany: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
};
const mockPrisma = { presupuesto: mockPresupuesto };
const mockVentas = { registrar: vi.fn() };
const SUC = 's1';
const USUARIO = { id: 'u1', email: 'duenio@nexo.com', sucursalId: SUC };

describe('PresupuestosService', () => {
  let service: PresupuestosService;
  beforeEach(() => {
    vi.clearAllMocks();
    service = new PresupuestosService(mockPrisma as never, mockVentas as never);
  });

  describe('crear', () => {
    it('calcula el total y asigna el número correlativo', async () => {
      mockPresupuesto.findFirst.mockResolvedValue({ numero: 4 }); // último
      mockPresupuesto.create.mockResolvedValue({ id: 'p1' });
      await service.crear(SUC, {
        items: [
          { descripcion: 'A', cantidad: '2', precioUnitario: '100' },
          { descripcion: 'B', cantidad: '1', precioUnitario: '50' },
        ],
      });
      const data = mockPresupuesto.create.mock.calls[0]![0].data;
      expect(data.numero).toBe(5);
      expect((data.total as Decimal).toString()).toBe('250');
      expect(data.items.create).toHaveLength(2);
    });

    it('arranca en 1 si no hay presupuestos previos', async () => {
      mockPresupuesto.findFirst.mockResolvedValue(null);
      mockPresupuesto.create.mockResolvedValue({ id: 'p1' });
      await service.crear(SUC, { items: [{ descripcion: 'A', cantidad: '1', precioUnitario: '10' }] });
      expect(mockPresupuesto.create.mock.calls[0]![0].data.numero).toBe(1);
    });
  });

  describe('anular / convertir', () => {
    it('anula un presupuesto vigente', async () => {
      mockPresupuesto.findFirst.mockResolvedValue({ id: 'p1', estado: 'VIGENTE', items: [] });
      mockPresupuesto.update.mockResolvedValue({});
      await service.anular(SUC, 'p1');
      expect(mockPresupuesto.update.mock.calls[0]![0].data.estado).toBe('ANULADO');
    });

    it('rechaza convertir si no está vigente', async () => {
      mockPresupuesto.findFirst.mockResolvedValue({ id: 'p1', estado: 'CONVERTIDO', items: [] });
      await expect(service.convertir(USUARIO, 'p1')).rejects.toThrow(BadRequestException);
    });

    it('lanza NotFound si no existe', async () => {
      mockPresupuesto.findFirst.mockResolvedValue(null);
      await expect(service.obtener(SUC, 'x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('convertir → venta real (Fase 9, ADR-0035)', () => {
    it('genera la venta con los ítems y marca el presupuesto CONVERTIDO', async () => {
      mockPresupuesto.findFirst.mockResolvedValue({
        id: 'p1', estado: 'VIGENTE',
        items: [
          { productoId: 'prod1', cantidad: new Decimal('2'), precioUnitario: new Decimal('100') },
          { productoId: 'prod2', cantidad: new Decimal('1'), precioUnitario: new Decimal('50') },
        ],
      });
      mockVentas.registrar.mockResolvedValue({ id: 'v1', numeroComprobante: 7, tipoComprobante: 'FacturaB' });
      mockPresupuesto.update.mockResolvedValue({ id: 'p1', estado: 'CONVERTIDO' });

      const r = await service.convertir(USUARIO, 'p1');

      const dto = mockVentas.registrar.mock.calls[0]![1];
      expect(dto.operacionId).toBe('presup-p1');
      expect(dto.medioPago).toBe('EFECTIVO');
      expect(dto.items).toEqual([
        { productoId: 'prod1', cantidad: '2', precioUnitario: '100' },
        { productoId: 'prod2', cantidad: '1', precioUnitario: '50' },
      ]);
      expect(mockPresupuesto.update.mock.calls[0]![0].data.estado).toBe('CONVERTIDO');
      expect(r.venta.id).toBe('v1');
    });

    it('rechaza convertir si hay una línea libre (sin producto del catálogo)', async () => {
      mockPresupuesto.findFirst.mockResolvedValue({
        id: 'p1', estado: 'VIGENTE',
        items: [{ productoId: null, cantidad: new Decimal('1'), precioUnitario: new Decimal('10') }],
      });
      await expect(service.convertir(USUARIO, 'p1')).rejects.toThrow(BadRequestException);
      expect(mockVentas.registrar).not.toHaveBeenCalled();
    });
  });
});
