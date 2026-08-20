import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LoginLockoutService } from './login-lockout.service';

describe('LoginLockoutService', () => {
  let service: LoginLockoutService;

  beforeEach(() => {
    service = new LoginLockoutService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('no bloquea un email sin intentos fallidos', () => {
    expect(service.estaBloqueado('a@b.com')).toBe(false);
  });

  it('no bloquea antes de llegar al máximo de intentos', () => {
    for (let i = 0; i < 4; i++) service.registrarFallo('a@b.com');
    expect(service.estaBloqueado('a@b.com')).toBe(false);
  });

  it('bloquea al llegar al máximo de intentos (5)', () => {
    for (let i = 0; i < 5; i++) service.registrarFallo('a@b.com');
    expect(service.estaBloqueado('a@b.com')).toBe(true);
  });

  it('registrarExito resetea el contador', () => {
    for (let i = 0; i < 5; i++) service.registrarFallo('a@b.com');
    service.registrarExito('a@b.com');
    expect(service.estaBloqueado('a@b.com')).toBe(false);
  });

  it('cuenta cada email por separado', () => {
    for (let i = 0; i < 5; i++) service.registrarFallo('a@b.com');
    expect(service.estaBloqueado('otro@b.com')).toBe(false);
  });

  it('el bloqueo expira pasada la ventana de tiempo', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    for (let i = 0; i < 5; i++) service.registrarFallo('a@b.com');
    expect(service.estaBloqueado('a@b.com')).toBe(true);

    vi.setSystemTime(new Date('2026-01-01T00:16:00Z')); // +16min > ventana de 15min
    expect(service.estaBloqueado('a@b.com')).toBe(false);
  });
});
