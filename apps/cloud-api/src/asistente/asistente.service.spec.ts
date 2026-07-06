import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { AsistenteService } from './asistente.service';

function mockConfig(valores: Record<string, string | undefined>) {
  return { get: (clave: string) => valores[clave] };
}

const mockConfigSistema = { findUnique: vi.fn(), upsert: vi.fn() };
function mockPrisma() {
  return { configuracionSistema: mockConfigSistema };
}

describe('AsistenteService', () => {
  const fetchOriginal = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfigSistema.findUnique.mockResolvedValue(null); // sin fila en base por defecto
  });

  afterEach(() => {
    global.fetch = fetchOriginal;
    vi.restoreAllMocks();
  });

  it('lanza ServiceUnavailableException si falta GEMINI_API_KEY (ni env ni base)', async () => {
    const service = new AsistenteService(mockConfig({}) as never, mockPrisma() as never);
    await expect(service.preguntar('hola')).rejects.toThrow(ServiceUnavailableException);
  });

  it('llama a Gemini con la clave y el modelo de la variable de entorno, y devuelve el texto', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '  Respuesta del modelo  ' }] } }] }),
    });
    global.fetch = fetchMock as never;

    const service = new AsistenteService(
      mockConfig({ GEMINI_API_KEY: 'clave-x', GEMINI_MODEL: 'modelo-y' }) as never,
      mockPrisma() as never,
    );
    const r = await service.preguntar('¿qué es el CAE?');

    expect(r).toBe('Respuesta del modelo'); // recortado
    const [url, opciones] = fetchMock.mock.calls[0]!;
    expect(url).toContain('modelo-y');
    expect(url).toContain('clave-x');
    const body = JSON.parse((opciones as { body: string }).body);
    expect(body.contents[0].parts[0].text).toBe('¿qué es el CAE?');
    expect(body.systemInstruction.parts[0].text).toContain('NexoSoft');
  });

  it('la clave cargada en la base tiene PRIORIDAD sobre la variable de entorno', async () => {
    mockConfigSistema.findUnique.mockResolvedValue({ geminiApiKey: 'clave-db', geminiModel: 'modelo-db' });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
    });
    global.fetch = fetchMock as never;

    const service = new AsistenteService(
      mockConfig({ GEMINI_API_KEY: 'clave-env', GEMINI_MODEL: 'modelo-env' }) as never,
      mockPrisma() as never,
    );
    await service.preguntar('hola');

    expect(fetchMock.mock.calls[0]![0]).toContain('clave-db');
    expect(fetchMock.mock.calls[0]![0]).toContain('modelo-db');
  });

  it('usa el modelo por defecto si no se configura ninguno', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
    });
    global.fetch = fetchMock as never;

    const service = new AsistenteService(mockConfig({ GEMINI_API_KEY: 'clave-x' }) as never, mockPrisma() as never);
    await service.preguntar('hola');

    expect(fetchMock.mock.calls[0]![0]).toContain('gemini-2.5-flash');
  });

  it('lanza ServiceUnavailableException si Gemini responde con error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'rate limit' } }),
    }) as never;

    const service = new AsistenteService(mockConfig({ GEMINI_API_KEY: 'clave-x' }) as never, mockPrisma() as never);
    await expect(service.preguntar('hola')).rejects.toThrow(ServiceUnavailableException);
  });

  it('lanza ServiceUnavailableException si falla la conexión', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as never;
    const service = new AsistenteService(mockConfig({ GEMINI_API_KEY: 'clave-x' }) as never, mockPrisma() as never);
    await expect(service.preguntar('hola')).rejects.toThrow(ServiceUnavailableException);
  });

  it('lanza ServiceUnavailableException si la respuesta no trae texto', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [] }) }) as never;
    const service = new AsistenteService(mockConfig({ GEMINI_API_KEY: 'clave-x' }) as never, mockPrisma() as never);
    await expect(service.preguntar('hola')).rejects.toThrow(ServiceUnavailableException);
  });

  describe('configuración (ADR-0040)', () => {
    it('obtenerConfiguracion informa que NO está configurada si no hay clave', async () => {
      const service = new AsistenteService(mockConfig({}) as never, mockPrisma() as never);
      const r = await service.obtenerConfiguracion();
      expect(r).toEqual({ configurada: false, modelo: 'gemini-2.5-flash' });
    });

    it('obtenerConfiguracion informa configurada=true si hay clave (env o base)', async () => {
      const service = new AsistenteService(mockConfig({ GEMINI_API_KEY: 'x' }) as never, mockPrisma() as never);
      const r = await service.obtenerConfiguracion();
      expect(r.configurada).toBe(true);
    });

    it('NUNCA devuelve la clave real en la respuesta', async () => {
      mockConfigSistema.findUnique.mockResolvedValue({ geminiApiKey: 'secreto-123', geminiModel: null });
      const service = new AsistenteService(mockConfig({}) as never, mockPrisma() as never);
      const r = await service.obtenerConfiguracion();
      expect(JSON.stringify(r)).not.toContain('secreto-123');
    });

    it('actualizarConfiguracion guarda (upsert) la clave y el modelo', async () => {
      mockConfigSistema.upsert.mockResolvedValue({ geminiApiKey: 'nueva', geminiModel: 'modelo-z' });
      const service = new AsistenteService(mockConfig({}) as never, mockPrisma() as never);
      const r = await service.actualizarConfiguracion('nueva', 'modelo-z');

      expect(mockConfigSistema.upsert).toHaveBeenCalledOnce();
      const args = mockConfigSistema.upsert.mock.calls[0]![0];
      expect(args.create.geminiApiKey).toBe('nueva');
      expect(args.update.geminiApiKey).toBe('nueva');
      expect(r).toEqual({ configurada: true, modelo: 'modelo-z' });
    });
  });
});
