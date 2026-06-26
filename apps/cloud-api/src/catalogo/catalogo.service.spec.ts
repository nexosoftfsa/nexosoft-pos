import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { CatalogoService } from './catalogo.service';

const mockCategoria = {
  findMany: vi.fn(),
  create: vi.fn(),
  findUnique: vi.fn(),
  delete: vi.fn(),
};

const mockProducto = {
  findMany: vi.fn(),
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
};

const mockPrisma = { categoria: mockCategoria, producto: mockProducto };

const SUCURSAL = 's1';

describe('CatalogoService', () => {
  let service: CatalogoService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CatalogoService(mockPrisma as never);
  });

  // ─── Categorías ──────────────────────────────────────────────────────────

  describe('listarCategorias', () => {
    it('delega a prisma.categoria.findMany', async () => {
      mockCategoria.findMany.mockResolvedValue([{ id: 'c1', nombre: 'Bebidas' }]);
      const result = await service.listarCategorias();
      expect(result).toHaveLength(1);
      expect(mockCategoria.findMany).toHaveBeenCalledOnce();
    });
  });

  describe('crearCategoria', () => {
    it('crea la categoría y la retorna', async () => {
      mockCategoria.create.mockResolvedValue({ id: 'c1', nombre: 'Bebidas' });
      const result = await service.crearCategoria({ nombre: 'Bebidas' });
      expect(result.nombre).toBe('Bebidas');
    });
  });

  describe('eliminarCategoria', () => {
    it('lanza NotFoundException si no existe', async () => {
      mockCategoria.findUnique.mockResolvedValue(null);
      await expect(service.eliminarCategoria('c-no')).rejects.toThrow(NotFoundException);
    });

    it('elimina si existe', async () => {
      mockCategoria.findUnique.mockResolvedValue({ id: 'c1' });
      mockCategoria.delete.mockResolvedValue({ id: 'c1' });
      await service.eliminarCategoria('c1');
      expect(mockCategoria.delete).toHaveBeenCalledOnce();
    });
  });

  // ─── Productos ───────────────────────────────────────────────────────────

  describe('crearProducto', () => {
    it('crea el producto cuando el código no existe', async () => {
      mockProducto.findUnique.mockResolvedValue(null);
      mockProducto.create.mockResolvedValue({
        id: 'p1', codigo: 'ABC', nombre: 'Coca Cola',
        precioVenta: '1500.00', precioCosto: '900.00',
        tipoIva: 'IVA_21', activo: true, categoria: null,
      });

      const result = await service.crearProducto(SUCURSAL, {
        codigo: 'ABC',
        nombre: 'Coca Cola',
        precioVenta: '1500.00',
        precioCosto: '900.00',
      });

      expect(result.codigo).toBe('ABC');
      expect(mockProducto.create).toHaveBeenCalledOnce();
    });

    it('lanza ConflictException si el código ya existe en la sucursal', async () => {
      mockProducto.findUnique.mockResolvedValue({ id: 'p1' });

      await expect(
        service.crearProducto(SUCURSAL, {
          codigo: 'DUP',
          nombre: 'Duplicado',
          precioVenta: '100',
          precioCosto: '50',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('obtenerProducto', () => {
    it('lanza NotFoundException si no pertenece a la sucursal', async () => {
      mockProducto.findFirst.mockResolvedValue(null);
      await expect(service.obtenerProducto('otra-sucursal', 'p1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('actualizarProducto', () => {
    it('actualiza solo los campos enviados', async () => {
      mockProducto.findFirst.mockResolvedValue({ id: 'p1', sucursalId: SUCURSAL });
      mockProducto.update.mockResolvedValue({ id: 'p1', nombre: 'Nuevo nombre', categoria: null });

      const result = await service.actualizarProducto(SUCURSAL, 'p1', { nombre: 'Nuevo nombre' });
      expect(result.nombre).toBe('Nuevo nombre');
      expect(mockProducto.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ nombre: 'Nuevo nombre' }) }),
      );
    });
  });

  describe('desactivarProducto', () => {
    it('pone activo=false', async () => {
      mockProducto.findFirst.mockResolvedValue({ id: 'p1', sucursalId: SUCURSAL });
      mockProducto.update.mockResolvedValue({ id: 'p1', activo: false });

      await service.desactivarProducto(SUCURSAL, 'p1');
      expect(mockProducto.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { activo: false } }),
      );
    });
  });
});
