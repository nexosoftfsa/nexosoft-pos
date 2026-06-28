import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TerminalesService } from './terminales.service';

const mockTerminal = { findMany: vi.fn(), create: vi.fn() };
const mockPrisma = { terminal: mockTerminal };

const SUCURSAL = 's1';

describe('TerminalesService', () => {
  let service: TerminalesService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TerminalesService(mockPrisma as never);
  });

  describe('listar', () => {
    it('lista solo las terminales activas de la sucursal, ordenadas', async () => {
      mockTerminal.findMany.mockResolvedValue([{ id: 't1', nombre: 'Caja 1' }]);

      const result = await service.listar(SUCURSAL);

      expect(result).toEqual([{ id: 't1', nombre: 'Caja 1' }]);
      expect(mockTerminal.findMany).toHaveBeenCalledWith({
        where: { sucursalId: SUCURSAL, activa: true },
        orderBy: { nombre: 'asc' },
      });
    });
  });

  describe('crear', () => {
    it('crea la terminal en la sucursal del usuario', async () => {
      mockTerminal.create.mockResolvedValue({ id: 't2', nombre: 'Caja 2', sucursalId: SUCURSAL });

      const result = await service.crear(SUCURSAL, { nombre: 'Caja 2' });

      expect(result.id).toBe('t2');
      expect(mockTerminal.create).toHaveBeenCalledWith({
        data: { nombre: 'Caja 2', sucursalId: SUCURSAL },
      });
    });
  });
});
