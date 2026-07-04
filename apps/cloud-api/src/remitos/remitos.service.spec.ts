import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RemitosService } from './remitos.service';

const mockRemito = { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() };
const mockPrisma = { remito: mockRemito };
const SUC = 's1';

describe('RemitosService', () => {
  let service: RemitosService;
  beforeEach(() => {
    vi.clearAllMocks();
    service = new RemitosService(mockPrisma as never);
  });

  it('crea con número correlativo', async () => {
    mockRemito.findFirst.mockResolvedValue({ numero: 7 });
    mockRemito.create.mockResolvedValue({ id: 'r1' });
    await service.crear(SUC, { items: [{ descripcion: 'Caja', cantidad: '3' }] });
    const data = mockRemito.create.mock.calls[0]![0].data;
    expect(data.numero).toBe(8);
    expect(data.items.create).toHaveLength(1);
  });

  it('arranca en 1 si no hay remitos', async () => {
    mockRemito.findFirst.mockResolvedValue(null);
    mockRemito.create.mockResolvedValue({ id: 'r1' });
    await service.crear(SUC, { items: [{ descripcion: 'X', cantidad: '1' }] });
    expect(mockRemito.create.mock.calls[0]![0].data.numero).toBe(1);
  });

  it('anula un remito emitido', async () => {
    mockRemito.findFirst.mockResolvedValue({ id: 'r1', estado: 'EMITIDO', items: [] });
    mockRemito.update.mockResolvedValue({});
    await service.anular(SUC, 'r1');
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
