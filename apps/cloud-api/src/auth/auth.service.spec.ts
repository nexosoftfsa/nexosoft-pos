import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException, HttpException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { LoginLockoutService } from './login-lockout.service';
import { RevisionClavesService } from './revision-claves.service';

// Mocks de dependencias — instanciación directa, sin DI de NestJS
const mockPrismaUsuario = {
  findUnique: vi.fn(),
  create: vi.fn(),
  findUniqueOrThrow: vi.fn(),
};

const mockPrismaRefreshToken = {
  findUnique: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
};

const mockPrismaRegistroAuditoria = {
  create: vi.fn(),
};

const mockPrisma = {
  usuario: mockPrismaUsuario,
  refreshToken: mockPrismaRefreshToken,
  registroAuditoria: mockPrismaRegistroAuditoria,
};

const mockJwt = {
  sign: vi.fn().mockReturnValue('mock-token'),
};

const mockConfig = {
  get: vi.fn().mockReturnValue(undefined),
  getOrThrow: vi.fn().mockReturnValue('secret'),
};

const mockCredenciales = {
  validar: vi.fn(),
};

describe('AuthService', () => {
  let authService: AuthService;
  let lockout: LoginLockoutService;
  let revisionClaves: RevisionClavesService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockJwt.sign.mockReturnValue('mock-token');
    lockout = new LoginLockoutService();
    revisionClaves = new RevisionClavesService();
    authService = new AuthService(
      mockPrisma as never,
      mockJwt as never,
      mockConfig as never,
      mockCredenciales as never,
      lockout,
      revisionClaves,
    );
  });

  describe('registrar', () => {
    it('crea un usuario nuevo y devuelve datos sin el hash', async () => {
      mockPrismaUsuario.findUnique.mockResolvedValue(null);
      mockPrismaUsuario.create.mockResolvedValue({
        id: 'u1',
        email: 'test@nexo.com',
        nombreDisplay: 'Test',
        rol: 'CAJERO',
        sucursalId: 's1',
      });

      const result = await authService.registrar({
        email: 'test@nexo.com',
        nombreDisplay: 'Test',
        password: 'secreto123',
        sucursalId: 's1',
      });

      expect(result).not.toHaveProperty('passwordHash');
      expect(result.email).toBe('test@nexo.com');
      expect(mockPrismaUsuario.create).toHaveBeenCalledOnce();
    });

    it('lanza ConflictException si el email ya existe', async () => {
      mockPrismaUsuario.findUnique.mockResolvedValue({ id: 'u1' });

      await expect(
        authService.registrar({
          email: 'dup@nexo.com',
          nombreDisplay: 'Dup',
          password: 'secreto123',
          sucursalId: 's1',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('devuelve tokens cuando las credenciales son correctas', async () => {
      const hash = await argon2.hash('password123');
      mockPrismaUsuario.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'test@nexo.com',
        passwordHash: hash,
        rol: 'CAJERO',
        sucursalId: 's1',
        activo: true,
      });
      mockPrismaRefreshToken.create.mockResolvedValue({});

      const result = await authService.login({ email: 'test@nexo.com', password: 'password123' });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('anota la contraseña débil al entrar, usando el nombre del comercio (Fase 17.C)', async () => {
      // Larga como para pasar la regla de largo: lo que la delata es que
      // contiene el nombre del comercio.
      const hash = await argon2.hash('LagusMinimarket2026');
      mockPrismaUsuario.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'admin@nexo.com',
        passwordHash: hash,
        rol: 'ADMIN',
        sucursalId: 's1',
        activo: true,
        sucursal: { nombre: 'Lagus' },
      });
      mockPrismaRefreshToken.create.mockResolvedValue({});

      await authService.login({ email: 'admin@nexo.com', password: 'LagusMinimarket2026' });

      const debil = revisionClaves.deUsuario('u1');
      expect(debil?.motivo).toContain('nombre del comercio');
      // Lo que se guarda es el veredicto, nunca la contraseña.
      expect(JSON.stringify(debil)).not.toContain('LagusMinimarket2026');
    });

    it('no anota nada si la contraseña aguanta estar publicada', async () => {
      const hash = await argon2.hash('Melon-Tractor-92');
      mockPrismaUsuario.findUnique.mockResolvedValue({
        id: 'u2',
        email: 'admin@nexo.com',
        passwordHash: hash,
        rol: 'ADMIN',
        sucursalId: 's1',
        activo: true,
        sucursal: { nombre: 'Lagus' },
      });
      mockPrismaRefreshToken.create.mockResolvedValue({});

      await authService.login({ email: 'admin@nexo.com', password: 'Melon-Tractor-92' });

      expect(revisionClaves.listar()).toEqual([]);
    });

    it('lanza UnauthorizedException si el usuario no existe', async () => {
      mockPrismaUsuario.findUnique.mockResolvedValue(null);

      await expect(
        authService.login({ email: 'no@nexo.com', password: 'abc' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('lanza UnauthorizedException si la password es incorrecta', async () => {
      const hash = await argon2.hash('correcta');
      mockPrismaUsuario.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'test@nexo.com',
        passwordHash: hash,
        rol: 'CAJERO',
        sucursalId: 's1',
        activo: true,
      });

      await expect(
        authService.login({ email: 'test@nexo.com', password: 'incorrecta' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('bloquea el login (429) tras 5 intentos fallidos consecutivos del mismo email', async () => {
      const hash = await argon2.hash('correcta');
      mockPrismaUsuario.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'test@nexo.com',
        passwordHash: hash,
        rol: 'CAJERO',
        sucursalId: 's1',
        activo: true,
      });

      for (let i = 0; i < 5; i++) {
        await expect(
          authService.login({ email: 'test@nexo.com', password: 'incorrecta' }),
        ).rejects.toThrow(UnauthorizedException);
      }

      // El 6to intento, incluso con la password correcta, queda bloqueado.
      await expect(
        authService.login({ email: 'test@nexo.com', password: 'correcta' }),
      ).rejects.toThrow(HttpException);
      expect(mockPrismaRegistroAuditoria.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ accion: 'LOGIN_BLOQUEADO', usuarioId: 'u1' }),
        }),
      );
    });

    it('un login exitoso resetea el contador de intentos fallidos', async () => {
      const hash = await argon2.hash('correcta');
      mockPrismaUsuario.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'test@nexo.com',
        passwordHash: hash,
        rol: 'CAJERO',
        sucursalId: 's1',
        activo: true,
      });
      mockPrismaRefreshToken.create.mockResolvedValue({});

      await expect(
        authService.login({ email: 'test@nexo.com', password: 'incorrecta' }),
      ).rejects.toThrow(UnauthorizedException);
      await authService.login({ email: 'test@nexo.com', password: 'correcta' });

      expect(lockout.estaBloqueado('test@nexo.com')).toBe(false);
    });
  });

  describe('loginConCredencial', () => {
    it('devuelve tokens cuando la credencial es válida', async () => {
      mockCredenciales.validar.mockResolvedValue({
        id: 'u1',
        email: 'test@nexo.com',
        rol: 'CAJERO',
        sucursalId: 's1',
      });
      mockPrismaRefreshToken.create.mockResolvedValue({});

      const result = await authService.loginConCredencial('NXSCRED:u1:token');

      expect(mockCredenciales.validar).toHaveBeenCalledWith('NXSCRED:u1:token');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('propaga el rechazo de CredencialesService.validar', async () => {
      mockCredenciales.validar.mockRejectedValue(new UnauthorizedException('Credencial inválida'));

      await expect(authService.loginConCredencial('basura')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('refresh', () => {
    it('lanza UnauthorizedException si el token no existe', async () => {
      mockPrismaRefreshToken.findUnique.mockResolvedValue(null);

      await expect(authService.refresh('token-inexistente')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('lanza UnauthorizedException si el token está expirado', async () => {
      mockPrismaRefreshToken.findUnique.mockResolvedValue({
        id: 'rt1',
        token: 'viejo',
        usuarioId: 'u1',
        expiraEn: new Date('2020-01-01'),
      });
      mockPrismaRefreshToken.delete.mockResolvedValue({});

      await expect(authService.refresh('viejo')).rejects.toThrow(UnauthorizedException);
    });

    it('rota el refresh token y devuelve nuevos tokens', async () => {
      const expiraEn = new Date(Date.now() + 86400000);
      mockPrismaRefreshToken.findUnique.mockResolvedValue({
        id: 'rt1',
        token: 'valido',
        usuarioId: 'u1',
        expiraEn,
      });
      mockPrismaRefreshToken.delete.mockResolvedValue({});
      mockPrismaUsuario.findUniqueOrThrow.mockResolvedValue({
        id: 'u1',
        email: 'test@nexo.com',
        rol: 'CAJERO',
        sucursalId: 's1',
        activo: true,
      });
      mockPrismaRefreshToken.create.mockResolvedValue({});

      const result = await authService.refresh('valido');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(mockPrismaRefreshToken.delete).toHaveBeenCalledOnce();
    });
  });
});
