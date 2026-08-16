import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ProveedoresService } from './proveedores.service';

const mockProveedor = { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() };
const mockPrisma = { proveedor: mockProveedor };

const SUCURSAL = 's1';
const ID = 'p1';

function proveedor(overrides: Record<string, unknown> = {}) {
  return { id: ID, nombre: 'Distribuidora Sur', activo: true, sucursalId: SUCURSAL, ...overrides };
}

describe('ProveedoresService', () => {
  let service: ProveedoresService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ProveedoresService(mockPrisma as never);
  });

  describe('listarProveedores', () => {
    it('filtra por sucursal y activo=true por defecto, ordenado por nombre', async () => {
      mockProveedor.findMany.mockResolvedValue([proveedor()]);
      await service.listarProveedores(SUCURSAL);
      const args = mockProveedor.findMany.mock.calls[0]![0];
      expect(args.where).toEqual({ sucursalId: SUCURSAL, activo: true });
      expect(args.orderBy).toEqual({ nombre: 'asc' });
    });

    it('con soloActivos=false incluye inactivos', async () => {
      mockProveedor.findMany.mockResolvedValue([]);
      await service.listarProveedores(SUCURSAL, false);
      const args = mockProveedor.findMany.mock.calls[0]![0];
      expect(args.where).toEqual({ sucursalId: SUCURSAL });
    });
  });

  describe('obtenerProveedor', () => {
    it('lanza NotFoundException si no existe', async () => {
      mockProveedor.findFirst.mockResolvedValue(null);
      await expect(service.obtenerProveedor(SUCURSAL, ID)).rejects.toThrow(NotFoundException);
    });

    it('devuelve el proveedor si existe', async () => {
      mockProveedor.findFirst.mockResolvedValue(proveedor());
      const res = await service.obtenerProveedor(SUCURSAL, ID);
      expect(res.nombre).toBe('Distribuidora Sur');
    });
  });

  describe('crearProveedor', () => {
    it('crea con los campos opcionales en null si no vienen', async () => {
      mockProveedor.create.mockResolvedValue(proveedor());
      await service.crearProveedor(SUCURSAL, { nombre: 'Distribuidora Sur' });
      const data = mockProveedor.create.mock.calls[0]![0].data;
      expect(data.nombre).toBe('Distribuidora Sur');
      expect(data.cuit).toBeNull();
      expect(data.sucursalId).toBe(SUCURSAL);
    });
  });

  describe('actualizarProveedor', () => {
    it('lanza NotFoundException si no existe', async () => {
      mockProveedor.findFirst.mockResolvedValue(null);
      await expect(
        service.actualizarProveedor(SUCURSAL, ID, { nombre: 'Nuevo nombre' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('solo actualiza los campos presentes en el dto', async () => {
      mockProveedor.findFirst.mockResolvedValue(proveedor());
      mockProveedor.update.mockResolvedValue(proveedor({ telefono: '123' }));
      await service.actualizarProveedor(SUCURSAL, ID, { telefono: '123' });
      const data = mockProveedor.update.mock.calls[0]![0].data;
      expect(data).toEqual({ telefono: '123' });
    });
  });

  describe('desactivarProveedor', () => {
    it('hace soft-delete (activo: false), no borra la fila', async () => {
      mockProveedor.findFirst.mockResolvedValue(proveedor());
      mockProveedor.update.mockResolvedValue(proveedor({ activo: false }));
      await service.desactivarProveedor(SUCURSAL, ID);
      expect(mockProveedor.update.mock.calls[0]![0]).toEqual({
        where: { id: ID },
        data: { activo: false },
      });
    });
  });
});
