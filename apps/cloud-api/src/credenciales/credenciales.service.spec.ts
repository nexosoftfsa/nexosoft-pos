import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { CredencialesService } from './credenciales.service';
import { armarPayload } from './credencial-payload';

const mockUsuario = { findFirst: vi.fn() };
const mockCredencialAcceso = {
  findUnique: vi.fn(),
  upsert: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
};
const mockRegistroAuditoria = { create: vi.fn() };

const mockPrisma = {
  usuario: mockUsuario,
  credencialAcceso: mockCredencialAcceso,
  registroAuditoria: mockRegistroAuditoria,
};

describe('CredencialesService', () => {
  let service: CredencialesService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CredencialesService(mockPrisma as never);
  });

  describe('regenerar', () => {
    it('lanza NotFoundException si el usuario no es de esa sucursal', async () => {
      mockUsuario.findFirst.mockResolvedValue(null);
      await expect(service.regenerar('u1', 's1')).rejects.toThrow(NotFoundException);
    });

    it('genera un payload nuevo, sube la versión y nunca persiste el token en claro', async () => {
      mockUsuario.findFirst.mockResolvedValue({ id: 'u1' });
      mockCredencialAcceso.findUnique.mockResolvedValue({ version: 2 });
      mockCredencialAcceso.upsert.mockResolvedValue({});
      mockRegistroAuditoria.create.mockResolvedValue({});

      const r = await service.regenerar('u1', 's1');

      expect(r.version).toBe(3);
      expect(r.payload.startsWith('NXSCRED:u1:')).toBe(true);

      const upsertArgs = mockCredencialAcceso.upsert.mock.calls[0][0];
      expect(upsertArgs.update.tokenHash).not.toContain(r.payload.split(':')[2]);
      expect(upsertArgs.update.version).toBe(3);
      expect(upsertArgs.update.activa).toBe(true);
      expect(upsertArgs.update.revocadaEn).toBeNull();

      expect(mockRegistroAuditoria.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ accion: 'CREDENCIAL_REGENERADA', usuarioId: 'u1' }),
        }),
      );
    });

    it('arranca en version 1 si no existía credencial previa', async () => {
      mockUsuario.findFirst.mockResolvedValue({ id: 'u1' });
      mockCredencialAcceso.findUnique.mockResolvedValue(null);
      mockCredencialAcceso.upsert.mockResolvedValue({});
      mockRegistroAuditoria.create.mockResolvedValue({});

      const r = await service.regenerar('u1', 's1');
      expect(r.version).toBe(1);
    });
  });

  describe('revocar', () => {
    it('lanza NotFoundException si el usuario no es de esa sucursal', async () => {
      mockUsuario.findFirst.mockResolvedValue(null);
      await expect(service.revocar('u1', 's1')).rejects.toThrow(NotFoundException);
    });

    it('desactiva la credencial y audita', async () => {
      mockUsuario.findFirst.mockResolvedValue({ id: 'u1' });
      mockCredencialAcceso.updateMany.mockResolvedValue({ count: 1 });
      mockRegistroAuditoria.create.mockResolvedValue({});

      await service.revocar('u1', 's1');

      expect(mockCredencialAcceso.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { usuarioId: 'u1' },
          data: expect.objectContaining({ activa: false }),
        }),
      );
      expect(mockRegistroAuditoria.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ accion: 'CREDENCIAL_REVOCADA' }),
        }),
      );
    });
  });

  describe('validar', () => {
    it('rechaza un payload con formato inválido sin tocar la base', async () => {
      await expect(service.validar('cualquier-cosa')).rejects.toThrow(UnauthorizedException);
      expect(mockCredencialAcceso.findUnique).not.toHaveBeenCalled();
    });

    it('rechaza si no existe credencial para ese usuarioId', async () => {
      mockCredencialAcceso.findUnique.mockResolvedValue(null);
      await expect(service.validar(armarPayload('u1', 'tok'))).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rechaza si la credencial está revocada', async () => {
      mockCredencialAcceso.findUnique.mockResolvedValue({
        activa: false,
        usuario: { activo: true, sucursalId: 's1' },
      });
      mockRegistroAuditoria.create.mockResolvedValue({});
      await expect(service.validar(armarPayload('u1', 'tok'))).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockRegistroAuditoria.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ accion: 'LOGIN_CREDENCIAL_FALLIDO' }),
        }),
      );
    });

    it('rechaza si el usuario está inactivo', async () => {
      mockCredencialAcceso.findUnique.mockResolvedValue({
        activa: true,
        usuario: { activo: false, sucursalId: 's1' },
      });
      mockRegistroAuditoria.create.mockResolvedValue({});
      await expect(service.validar(armarPayload('u1', 'tok'))).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rechaza si el token no matchea el hash', async () => {
      const tokenHash = await argon2.hash('el-correcto');
      mockCredencialAcceso.findUnique.mockResolvedValue({
        activa: true,
        tokenHash,
        usuario: { activo: true, sucursalId: 's1' },
      });
      mockRegistroAuditoria.create.mockResolvedValue({});

      await expect(service.validar(armarPayload('u1', 'otro-token'))).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('acepta el token correcto, actualiza ultimoUsoEn y audita el login', async () => {
      const tokenHash = await argon2.hash('el-correcto');
      const usuario = { id: 'u1', activo: true, sucursalId: 's1' };
      mockCredencialAcceso.findUnique.mockResolvedValue({ activa: true, tokenHash, usuario });
      mockCredencialAcceso.update.mockResolvedValue({});
      mockRegistroAuditoria.create.mockResolvedValue({});

      const r = await service.validar(armarPayload('u1', 'el-correcto'));

      expect(r).toBe(usuario);
      expect(mockCredencialAcceso.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { usuarioId: 'u1' },
          data: expect.objectContaining({ ultimoUsoEn: expect.any(Date) }),
        }),
      );
      expect(mockRegistroAuditoria.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ accion: 'LOGIN_CREDENCIAL', exito: true }),
        }),
      );
    });
  });
});
