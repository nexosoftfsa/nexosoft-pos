import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComercioService } from './comercio.service';

const mockConfigSistema = { findUnique: vi.fn(), upsert: vi.fn() };
function mockPrisma() {
  return { configuracionSistema: mockConfigSistema };
}

describe('ComercioService', () => {
  let service: ComercioService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ComercioService(mockPrisma() as never);
  });

  describe('obtenerLogo', () => {
    it('devuelve null si no hay fila de configuración', async () => {
      mockConfigSistema.findUnique.mockResolvedValue(null);
      await expect(service.obtenerLogo()).resolves.toEqual({ logoBase64: null });
    });

    it('devuelve el logo guardado', async () => {
      mockConfigSistema.findUnique.mockResolvedValue({ logoBase64: 'data:image/png;base64,abc' });
      await expect(service.obtenerLogo()).resolves.toEqual({ logoBase64: 'data:image/png;base64,abc' });
    });
  });

  describe('actualizarLogo', () => {
    it('guarda el logo (upsert)', async () => {
      mockConfigSistema.upsert.mockResolvedValue({ logoBase64: 'data:image/png;base64,abc' });
      const r = await service.actualizarLogo('data:image/png;base64,abc');
      expect(r).toEqual({ logoBase64: 'data:image/png;base64,abc' });
      expect(mockConfigSistema.upsert).toHaveBeenCalledWith({
        where: { id: 1 },
        create: { id: 1, logoBase64: 'data:image/png;base64,abc' },
        update: { logoBase64: 'data:image/png;base64,abc' },
      });
    });

    it('un string vacío borra el logo (guarda null)', async () => {
      mockConfigSistema.upsert.mockResolvedValue({ logoBase64: null });
      const r = await service.actualizarLogo('   ');
      expect(r).toEqual({ logoBase64: null });
      expect(mockConfigSistema.upsert).toHaveBeenCalledWith({
        where: { id: 1 },
        create: { id: 1, logoBase64: null },
        update: { logoBase64: null },
      });
    });
  });
});
