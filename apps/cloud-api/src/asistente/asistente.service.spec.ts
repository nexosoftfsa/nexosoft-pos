import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { AsistenteService } from './asistente.service';

function mockConfig(valores: Record<string, string | undefined>) {
  return { get: (clave: string) => valores[clave] };
}

describe('AsistenteService', () => {
  const fetchOriginal = global.fetch;

  afterEach(() => {
    global.fetch = fetchOriginal;
    vi.restoreAllMocks();
  });

  it('lanza ServiceUnavailableException si falta GEMINI_API_KEY', async () => {
    const service = new AsistenteService(mockConfig({}) as never);
    await expect(service.preguntar('hola')).rejects.toThrow(ServiceUnavailableException);
  });

  it('llama a Gemini con la clave y el modelo configurados, y devuelve el texto', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '  Respuesta del modelo  ' }] } }] }),
    });
    global.fetch = fetchMock as never;

    const service = new AsistenteService(
      mockConfig({ GEMINI_API_KEY: 'clave-x', GEMINI_MODEL: 'modelo-y' }) as never,
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

  it('usa el modelo por defecto si no se configura GEMINI_MODEL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
    });
    global.fetch = fetchMock as never;

    const service = new AsistenteService(mockConfig({ GEMINI_API_KEY: 'clave-x' }) as never);
    await service.preguntar('hola');

    expect(fetchMock.mock.calls[0]![0]).toContain('gemini-2.5-flash');
  });

  it('lanza ServiceUnavailableException si Gemini responde con error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'rate limit' } }),
    }) as never;

    const service = new AsistenteService(mockConfig({ GEMINI_API_KEY: 'clave-x' }) as never);
    await expect(service.preguntar('hola')).rejects.toThrow(ServiceUnavailableException);
  });

  it('lanza ServiceUnavailableException si falla la conexión', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as never;
    const service = new AsistenteService(mockConfig({ GEMINI_API_KEY: 'clave-x' }) as never);
    await expect(service.preguntar('hola')).rejects.toThrow(ServiceUnavailableException);
  });

  it('lanza ServiceUnavailableException si la respuesta no trae texto', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [] }) }) as never;
    const service = new AsistenteService(mockConfig({ GEMINI_API_KEY: 'clave-x' }) as never);
    await expect(service.preguntar('hola')).rejects.toThrow(ServiceUnavailableException);
  });
});
