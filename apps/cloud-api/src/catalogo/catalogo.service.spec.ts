import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { CatalogoService } from './catalogo.service';
import { COLUMNAS_IMPORTAR_PRODUCTOS as COL } from './importar-productos-lote';

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

// ─── Importación masiva (Fase 14.B) ─────────────────────────────────────────
// Describe aparte: usa un mock de $transaction con forma de `tx` (categoria/
// producto/movimientoStock) distinta del mockPrisma plano de arriba, porque
// importarProductos() opera siempre dentro de una transacción.

function filaCruda(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    [COL.codigo]: '111',
    [COL.descripcion]: 'Gaseosa 500ml',
    [COL.rubro]: 'Kiosco',
    [COL.precioCosto]: '100',
    [COL.porcentajeIva]: '21',
    [COL.precioVenta]: '200',
    [COL.stock]: '10',
    [COL.activo]: 'S',
    ...overrides,
  };
}

describe('CatalogoService.importarProductos', () => {
  let tx: {
    categoria: { findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
    producto: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
    movimientoStock: { create: ReturnType<typeof vi.fn> };
  };
  let prisma: { $transaction: ReturnType<typeof vi.fn> };
  let service: CatalogoService;

  beforeEach(() => {
    tx = {
      categoria: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: `cat-${data.nombre}`, nombre: data.nombre })),
      },
      producto: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: `prod-${data.codigo}`, ...data })),
      },
      movimientoStock: { create: vi.fn().mockResolvedValue({}) },
    };
    prisma = { $transaction: vi.fn((cb: (t: typeof tx) => unknown) => cb(tx)) };
    service = new CatalogoService(prisma as never);
  });

  it('crea un producto nuevo, su categoría, y siembra el stock inicial', async () => {
    const resultados = await service.importarProductos('s1', [filaCruda()], false);

    expect(resultados).toEqual([{ fila: 2, resultado: 'creada' }]);
    expect(tx.categoria.create).toHaveBeenCalledWith({ data: { nombre: 'Kiosco' } });
    expect(tx.producto.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ codigo: '111', categoriaId: 'cat-Kiosco', sucursalId: 's1', activo: true }),
    });
    expect(tx.movimientoStock.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tipo: 'ENTRADA', cantidad: '10', productoId: 'prod-111' }),
    });
  });

  it('reusa una categoría que ya existe en vez de duplicarla', async () => {
    tx.categoria.findMany.mockResolvedValue([{ id: 'cat-existente', nombre: 'Kiosco' }]);
    await service.importarProductos('s1', [filaCruda()], false);
    expect(tx.categoria.create).not.toHaveBeenCalled();
    expect(tx.producto.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ categoriaId: 'cat-existente' }),
    });
  });

  it('omite (no pisa) un producto cuyo código ya existe', async () => {
    tx.producto.findUnique.mockResolvedValue({ id: 'prod-viejo' });
    const resultados = await service.importarProductos('s1', [filaCruda()], false);
    expect(resultados).toEqual([{ fila: 2, resultado: 'omitida', mensaje: 'Ya existe un producto con código 111' }]);
    expect(tx.producto.create).not.toHaveBeenCalled();
  });

  it('una fila con error no aborta el resto del lote', async () => {
    const filas = [filaCruda({ [COL.porcentajeIva]: '15' }), filaCruda({ [COL.codigo]: '222' })];
    const resultados = await service.importarProductos('s1', filas, false);
    expect(resultados[0]).toEqual({ fila: 2, resultado: 'error', mensaje: '% IVA no reconocido: 15' });
    expect(resultados[1]).toEqual({ fila: 3, resultado: 'creada' });
    expect(tx.producto.create).toHaveBeenCalledOnce();
  });

  it('conserva las advertencias del mapeo (ej. precio en $0) en el resultado de la fila', async () => {
    const resultados = await service.importarProductos('s1', [filaCruda({ [COL.precioVenta]: '0' })], false);
    expect(resultados[0]).toEqual({
      fila: 2,
      resultado: 'creada',
      advertencia: 'Precio de venta en $0 — revisar antes de vender.',
    });
  });

  it('dry-run devuelve el reporte igual, atrapando el sentinel RevertirDryRun', async () => {
    // Este mock no simula el rollback real de Postgres (eso solo lo prueba
    // una transacción real) -- lo que sí valida es que el service atrapa su
    // propio sentinel y arma el mismo reporte que la corrida real, sin que
    // el error se escape como una excepción sin manejar.
    const resultados = await service.importarProductos('s1', [filaCruda()], true);
    expect(resultados).toEqual([{ fila: 2, resultado: 'creada' }]);
  });
});
