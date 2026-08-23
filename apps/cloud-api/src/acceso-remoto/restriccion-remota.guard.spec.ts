import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { RestriccionRemotaGuard, PUERTO_REMOTO_DEFECTO } from './restriccion-remota.guard';

const PUERTO_LAN = 3000;

function contexto(pedido: Record<string, unknown>) {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => pedido }),
  } as never;
}

function pedido({
  metodo = 'GET',
  url = '/api/v1/reportes/ventas/serie',
  puerto = PUERTO_LAN,
  host = '192.168.0.10:3000',
}: { metodo?: string; url?: string; puerto?: number; host?: string } = {}) {
  return {
    method: metodo,
    originalUrl: url,
    socket: { localPort: puerto },
    headers: { host },
  } as Record<string, unknown>;
}

describe('RestriccionRemotaGuard', () => {
  let guard: RestriccionRemotaGuard;
  let hostnamePublico: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    hostnamePublico = vi.fn().mockResolvedValue(null);
    guard = new RestriccionRemotaGuard({ hostnamePublico } as never);
  });

  afterEach(() => {
    delete process.env['PORT_REMOTO'];
  });

  describe('peticiones de la LAN (el POS, el panel en el local)', () => {
    it('no toca nada: pasa cualquier método', async () => {
      await expect(
        guard.canActivate(contexto(pedido({ metodo: 'POST', url: '/api/v1/ventas' }))),
      ).resolves.toBe(true);
    });

    it('tampoco las marca como remotas', async () => {
      const p = pedido();
      await guard.canActivate(contexto(p));
      expect(p['esRemota']).toBeUndefined();
    });
  });

  describe('peticiones que entran por el puerto del túnel', () => {
    it('deja pasar un reporte', async () => {
      await expect(
        guard.canActivate(contexto(pedido({ puerto: PUERTO_REMOTO_DEFECTO }))),
      ).resolves.toBe(true);
    });

    it('las marca como remotas, para la auditoría', async () => {
      const p = pedido({ puerto: PUERTO_REMOTO_DEFECTO });
      await guard.canActivate(contexto(p));
      expect(p['esRemota']).toBe(true);
    });

    it('rechaza una escritura aunque el token sea válido', async () => {
      await expect(
        guard.canActivate(
          contexto(
            pedido({ metodo: 'POST', url: '/api/v1/ventas', puerto: PUERTO_REMOTO_DEFECTO }),
          ),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rechaza traerse la credencial de un empleado', async () => {
      await expect(
        guard.canActivate(
          contexto(
            pedido({ url: '/api/v1/usuarios/u1/credencial', puerto: PUERTO_REMOTO_DEFECTO }),
          ),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('respeta PORT_REMOTO si está configurado', async () => {
      process.env['PORT_REMOTO'] = '4100';
      await expect(
        guard.canActivate(
          contexto(pedido({ metodo: 'POST', url: '/api/v1/ventas', puerto: 4100 })),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('reconocimiento por Host (instalaciones viejas, túnel apuntando al puerto de la LAN)', () => {
    beforeEach(() => {
      hostnamePublico.mockResolvedValue('lagus.nexosoft.com.ar');
    });

    it('restringe igual aunque haya entrado por el puerto de la LAN', async () => {
      await expect(
        guard.canActivate(
          contexto(
            pedido({ metodo: 'POST', url: '/api/v1/ventas', host: 'lagus.nexosoft.com.ar' }),
          ),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('tolera que el Host traiga el puerto', async () => {
      const p = pedido({ host: 'lagus.nexosoft.com.ar:443' });
      await guard.canActivate(contexto(p));
      expect(p['esRemota']).toBe(true);
    });

    it('no confunde a una petición de la LAN con una remota', async () => {
      const p = pedido({ metodo: 'POST', url: '/api/v1/ventas', host: '192.168.0.10:3000' });
      await expect(guard.canActivate(contexto(p))).resolves.toBe(true);
    });
  });
});
