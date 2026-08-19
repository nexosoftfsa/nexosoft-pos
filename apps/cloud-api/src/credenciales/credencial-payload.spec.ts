import { describe, it, expect } from 'vitest';
import { armarPayload, generarTokenPlano, parsearPayload } from './credencial-payload';

describe('credencial-payload', () => {
  it('arma y parsea el payload en un roundtrip', () => {
    const payload = armarPayload('u1', 'token-abc123');
    expect(payload).toBe('NXSCRED:u1:token-abc123');
    expect(parsearPayload(payload)).toEqual({ usuarioId: 'u1', tokenPlano: 'token-abc123' });
  });

  it('rechaza un código sin el prefijo esperado', () => {
    expect(parsearPayload('OTRO:u1:token')).toBeNull();
  });

  it('rechaza un código con formato inválido (partes de más o de menos)', () => {
    expect(parsearPayload('NXSCRED:u1')).toBeNull();
    expect(parsearPayload('NXSCRED:u1:token:extra')).toBeNull();
    expect(parsearPayload('')).toBeNull();
  });

  it('rechaza un código con usuarioId o token vacíos', () => {
    expect(parsearPayload('NXSCRED::token')).toBeNull();
    expect(parsearPayload('NXSCRED:u1:')).toBeNull();
  });

  it('genera tokens aleatorios y distintos en cada llamada', () => {
    const a = generarTokenPlano();
    const b = generarTokenPlano();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(20);
  });
});
