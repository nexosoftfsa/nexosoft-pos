import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
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

const mockComboComponente = {
  deleteMany: vi.fn(),
  createMany: vi.fn(),
};

const mockPrisma = {
  categoria: mockCategoria,
  producto: mockProducto,
  comboComponente: mockComboComponente,
  $transaction: vi.fn((cb: (tx: typeof mockPrisma) => unknown) => cb(mockPrisma)),
};

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

  // ─── Combos (Fase 8.1) ─────────────────────────────────────────────────────

  describe('crearProducto (combo)', () => {
    const comboBase = {
      codigo: 'COMBO1',
      nombre: 'Combo Merienda',
      precioVenta: '3000',
      precioCosto: '1800',
      tipo: 'COMBO' as const,
    };

    it('crea el combo con sus componentes (create anidado, tipo COMBO)', async () => {
      mockProducto.findUnique.mockResolvedValue(null);
      mockProducto.findMany.mockResolvedValue([
        { id: 'cafe', tipo: 'SIMPLE' },
        { id: 'alfajor', tipo: 'SIMPLE' },
      ]);
      mockProducto.create.mockResolvedValue({ id: 'combo1', codigo: 'COMBO1' });

      await service.crearProducto(SUCURSAL, {
        ...comboBase,
        componentes: [
          { componenteId: 'cafe', cantidad: '1' },
          { componenteId: 'alfajor', cantidad: '2' },
        ],
      });

      const data = mockProducto.create.mock.calls[0]![0].data;
      expect(data.tipo).toBe('COMBO');
      expect(data.componentes.create).toEqual([
        { componenteId: 'cafe', cantidad: '1' },
        { componenteId: 'alfajor', cantidad: '2' },
      ]);
    });

    it('rechaza un combo sin componentes', async () => {
      mockProducto.findUnique.mockResolvedValue(null);
      await expect(
        service.crearProducto(SUCURSAL, { ...comboBase, componentes: [] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza componentes repetidos', async () => {
      mockProducto.findUnique.mockResolvedValue(null);
      await expect(
        service.crearProducto(SUCURSAL, {
          ...comboBase,
          componentes: [
            { componenteId: 'cafe', cantidad: '1' },
            { componenteId: 'cafe', cantidad: '2' },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza un componente que no existe en la sucursal', async () => {
      mockProducto.findUnique.mockResolvedValue(null);
      mockProducto.findMany.mockResolvedValue([]); // ninguno existe
      await expect(
        service.crearProducto(SUCURSAL, {
          ...comboBase,
          componentes: [{ componenteId: 'fantasma', cantidad: '1' }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza un combo dentro de otro combo', async () => {
      mockProducto.findUnique.mockResolvedValue(null);
      mockProducto.findMany.mockResolvedValue([{ id: 'otroCombo', tipo: 'COMBO' }]);
      await expect(
        service.crearProducto(SUCURSAL, {
          ...comboBase,
          componentes: [{ componenteId: 'otroCombo', cantidad: '1' }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza cantidad de componente no positiva', async () => {
      mockProducto.findUnique.mockResolvedValue(null);
      await expect(
        service.crearProducto(SUCURSAL, {
          ...comboBase,
          componentes: [{ componenteId: 'cafe', cantidad: '0' }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('actualizarProducto (combo)', () => {
    it('reemplaza el set de componentes en transacción', async () => {
      mockProducto.findFirst.mockResolvedValue({ id: 'combo1', sucursalId: SUCURSAL, tipo: 'COMBO' });
      mockProducto.findMany.mockResolvedValue([{ id: 'cafe', tipo: 'SIMPLE' }]);
      mockProducto.update.mockResolvedValue({ id: 'combo1' });

      await service.actualizarProducto(SUCURSAL, 'combo1', {
        componentes: [{ componenteId: 'cafe', cantidad: '3' }],
      });

      expect(mockComboComponente.deleteMany).toHaveBeenCalledWith({ where: { comboId: 'combo1' } });
      expect(mockComboComponente.createMany).toHaveBeenCalledWith({
        data: [{ comboId: 'combo1', componenteId: 'cafe', cantidad: '3' }],
      });
    });

    it('rechaza cargar componentes en un producto simple', async () => {
      mockProducto.findFirst.mockResolvedValue({ id: 'p1', sucursalId: SUCURSAL, tipo: 'SIMPLE' });
      await expect(
        service.actualizarProducto(SUCURSAL, 'p1', {
          componentes: [{ componenteId: 'cafe', cantidad: '1' }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
