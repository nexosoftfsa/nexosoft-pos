import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { RegistroGuard } from './registro.guard';

function contexto(user?: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RegistroGuard', () => {
  let prisma: { usuario: { count: ReturnType<typeof vi.fn> } };
  let jwtAuthGuard: { canActivate: ReturnType<typeof vi.fn> };
  let guard: RegistroGuard;

  beforeEach(() => {
    prisma = { usuario: { count: vi.fn() } };
    jwtAuthGuard = { canActivate: vi.fn() };
    guard = new RegistroGuard(prisma as never, jwtAuthGuard as never);
  });

  it('deja pasar sin autenticación cuando no hay usuarios (alta del primer admin)', async () => {
    prisma.usuario.count.mockResolvedValue(0);

    await expect(guard.canActivate(contexto())).resolves.toBe(true);
    expect(jwtAuthGuard.canActivate).not.toHaveBeenCalled();
  });

  it('exige sesión válida cuando ya hay usuarios', async () => {
    prisma.usuario.count.mockResolvedValue(1);
    jwtAuthGuard.canActivate.mockResolvedValue(false);

    await expect(guard.canActivate(contexto())).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza si el usuario autenticado no es ADMIN', async () => {
    prisma.usuario.count.mockResolvedValue(1);
    jwtAuthGuard.canActivate.mockResolvedValue(true);

    await expect(guard.canActivate(contexto({ rol: 'CAJERO' }))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('deja pasar cuando el usuario autenticado es ADMIN', async () => {
    prisma.usuario.count.mockResolvedValue(1);
    jwtAuthGuard.canActivate.mockResolvedValue(true);

    await expect(guard.canActivate(contexto({ rol: 'ADMIN' }))).resolves.toBe(true);
  });
});
