import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { EstadoSuscripcion, Plan, type Licencia } from '@nexosoft/licencias';
import { LicenciasHttp } from './licencias-http';

let clavePublicaBase64: string;
let privada: KeyObject;

beforeAll(() => {
  const par = generateKeyPairSync('ed25519');
  clavePublicaBase64 = par.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  privada = par.privateKey;
});

function firmar(licencia: unknown): string {
  const payload = Buffer.from(JSON.stringify(licencia), 'utf8');
  return `${payload.toString('base64url')}.${sign(null, payload, privada).toString('base64url')}`;
}

const LICENCIA: Licencia = {
  comercioId: 'lagus',
  estado: EstadoSuscripcion.Activa,
  plan: Plan.Plus,
  vencePagoEl: '2026-09-10',
  validaHasta: '2026-08-30T00:00:00Z',
  emitidaEn: '2026-08-23T00:00:00Z',
  mensaje: null,
};

function respuestaCon(token: string) {
  return { ok: true, status: 200, json: () => Promise.resolve({ token }) };
}

describe('LicenciasHttp', () => {
  let proveedor: LicenciasHttp;

  beforeEach(() => {
    vi.restoreAllMocks();
    proveedor = new LicenciasHttp('https://licencias.test', clavePublicaBase64, '0.8.1');
  });

  it('devuelve la licencia cuando el Worker responde bien', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuestaCon(firmar(LICENCIA))));

    await expect(proveedor.obtener('lagus')).resolves.toEqual(LICENCIA);
  });

  it('manda el heartbeat de soporte: sólo comercio y versión, nada del negocio', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuestaCon(firmar(LICENCIA)));
    vi.stubGlobal('fetch', fetchMock);

    await proveedor.obtener('lagus');

    const [, opciones] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(opciones.body)).toEqual({ comercioId: 'lagus', version: '0.8.1' });
  });

  describe('nunca lanza, devuelve null y quien llama sigue con lo que tenga', () => {
    it('sin internet', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND')));
      await expect(proveedor.obtener('lagus')).resolves.toBeNull();
    });

    it('si el Worker responde un error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
      await expect(proveedor.obtener('lagus')).resolves.toBeNull();
    });

    it('si la respuesta no trae token', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }),
      );
      await expect(proveedor.obtener('lagus')).resolves.toBeNull();
    });

    it('si el cuerpo no es JSON', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, json: () => Promise.reject(new Error('x')) }),
      );
      await expect(proveedor.obtener('lagus')).resolves.toBeNull();
    });
  });

  describe('rechazos de seguridad', () => {
    it('un token firmado con otra clave', async () => {
      const impostor = generateKeyPairSync('ed25519');
      const payload = Buffer.from(JSON.stringify(LICENCIA), 'utf8');
      const falso = `${payload.toString('base64url')}.${sign(null, payload, impostor.privateKey).toString('base64url')}`;
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuestaCon(falso)));

      await expect(proveedor.obtener('lagus')).resolves.toBeNull();
    });

    it('una licencia bien firmada pero de OTRO comercio', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(respuestaCon(firmar({ ...LICENCIA, comercioId: 'otro' }))),
      );

      await expect(proveedor.obtener('lagus')).resolves.toBeNull();
    });

    it('sin clave pública configurada no confía en nada (y no bloquea)', async () => {
      const sinClave = new LicenciasHttp('https://licencias.test', '', '0.8.1');
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      await expect(sinClave.obtener('lagus')).resolves.toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it('devuelve el token crudo para poder guardarlo y reusarlo sin red', async () => {
    const token = firmar(LICENCIA);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuestaCon(token)));

    const r = await proveedor.obtenerConToken('lagus');

    expect(r?.token).toBe(token);
    expect(r?.licencia).toEqual(LICENCIA);
  });
});
