import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

function contextoConUsuario(user: unknown): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let reflector: { getAllAndOverride: ReturnType<typeof vi.fn> };
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: vi.fn() };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('deja pasar cuando la ruta no declara roles', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(contextoConUsuario({ rol: 'CAJERO' }))).toBe(true);
  });

  it('deja pasar cuando el rol del usuario está permitido', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN', 'SUPERVISOR']);
    expect(guard.canActivate(contextoConUsuario({ rol: 'SUPERVISOR' }))).toBe(true);
  });

  it('rechaza con ForbiddenException cuando el rol no está permitido', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN', 'SUPERVISOR']);
    expect(() => guard.canActivate(contextoConUsuario({ rol: 'CAJERO' }))).toThrow(
      ForbiddenException,
    );
  });

  it('rechaza cuando no hay usuario en la request', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);
    expect(() => guard.canActivate(contextoConUsuario(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
