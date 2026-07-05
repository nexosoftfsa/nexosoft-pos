import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { RemitosService } from './remitos.service';

const mockRemito = { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() };
const mockMovimiento = { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]) };
const mockProducto = { findFirst: vi.fn().mockResolvedValue({ requiereLote: false }) };
const mockLote = { findMany: vi.fn().mockResolvedValue([]) };
const mockPrisma = {
  remito: mockRemito,
  movimientoStock: mockMovimiento,
  producto: mockProducto,
  lote: mockLote,
  $transaction: vi.fn((cb: (tx: typeof mockPrisma) => unknown) => cb(mockPrisma)),
};
const SUC = 's1';

describe('RemitosService', () => {
  let service: RemitosService;
  beforeEach(() => {
    vi.clearAllMocks();
    mockMovimiento.findMany.mockResolvedValue([]);
    mockProducto.findFirst.mockResolvedValue({ requiereLote: false });
    mockLote.findMany.mockResolvedValue([]);
    service = new RemitosService(mockPrisma as never);
  });

  it('crea con número correlativo', async () => {
    mockRemito.findFirst.mockResolvedValue({ numero: 7 });
    mockRemito.create.mockResolvedValue({ id: 'r1', numero: 8, items: [] });
    await service.crear(SUC, { items: [{ descripcion: 'Caja', cantidad: '3' }] });
    const data = mockRemito.create.mock.calls[0]![0].data;
    expect(data.numero).toBe(8);
    expect(data.items.create).toHaveLength(1);
  });

  it('arranca en 1 si no hay remitos', async () => {
    mockRemito.findFirst.mockResolvedValue(null);
    mockRemito.create.mockResolvedValue({ id: 'r1', numero: 1, items: [] });
    await service.crear(SUC, { items: [{ descripcion: 'X', cantidad: '1' }] });
    expect(mockRemito.create.mock.calls[0]![0].data.numero).toBe(1);
  });

  it('al emitir descuenta stock (SALIDA) de los ítems con producto', async () => {
    mockRemito.findFirst.mockResolvedValue({ numero: 0 });
    mockRemito.create.mockResolvedValue({
      id: 'r1', numero: 1,
      items: [
        { productoId: 'prod1', cantidad: new Decimal('3') },
        { productoId: null, cantidad: new Decimal('1') }, // línea libre: no mueve stock
      ],
    });

    await service.crear(SUC, {
      items: [
        { descripcion: 'Caja', cantidad: '3', productoId: 'prod1' },
        { descripcion: 'Nota', cantidad: '1' },
      ],
    });

    expect(mockMovimiento.create).toHaveBeenCalledTimes(1);
    const mov = mockMovimiento.create.mock.calls[0]![0].data;
    expect(mov.tipo).toBe('SALIDA');
    expect(mov.productoId).toBe('prod1');
    expect(mov.remitoId).toBe('r1');
    expect(mov.cantidad.toString()).toBe('3');
  });

  it('anula un remito emitido y restaura el stock (ENTRADA espejo)', async () => {
    mockRemito.findFirst.mockResolvedValue({ id: 'r1', estado: 'EMITIDO', numero: 1, items: [] });
    mockMovimiento.findMany.mockResolvedValue([
      { productoId: 'prod1', cantidad: new Decimal('3'), loteId: null, tipo: 'SALIDA' },
    ]);
    mockRemito.update.mockResolvedValue({});

    await service.anular(SUC, 'r1');

    expect(mockMovimiento.create).toHaveBeenCalledTimes(1);
    expect(mockMovimiento.create.mock.calls[0]![0].data.tipo).toBe('ENTRADA');
    expect(mockRemito.update.mock.calls[0]![0].data.estado).toBe('ANULADO');
  });

  it('rechaza anular uno ya anulado', async () => {
    mockRemito.findFirst.mockResolvedValue({ id: 'r1', estado: 'ANULADO', items: [] });
    await expect(service.anular(SUC, 'r1')).rejects.toThrow(BadRequestException);
  });

  it('lanza NotFound si no existe', async () => {
    mockRemito.findFirst.mockResolvedValue(null);
    await expect(service.obtener(SUC, 'x')).rejects.toThrow(NotFoundException);
  });
});
