import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RolUsuario } from '@prisma/client';
import { UsuariosService } from './usuarios.service';

const mockUsuario = { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() };
function mockPrisma() {
  return { usuario: mockUsuario };
}

describe('UsuariosService', () => {
  let service: UsuariosService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new UsuariosService(mockPrisma() as never);
  });

  describe('listar', () => {
    it('lista los usuarios de la sucursal, ordenados por alta', async () => {
      mockUsuario.findMany.mockResolvedValue([{ id: 'u1' }]);
      const r = await service.listar('s1');
      expect(r).toEqual([{ id: 'u1' }]);
      expect(mockUsuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { sucursalId: 's1' }, orderBy: { creadoEn: 'asc' } }),
      );
    });
  });

  describe('actualizar', () => {
    it('lanza NotFoundException si el usuario no es de esa sucursal', async () => {
      mockUsuario.findFirst.mockResolvedValue(null);
      await expect(service.actualizar('u1', 's1', 'admin1', { activo: false })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rechaza que un admin se desactive a sí mismo', async () => {
      mockUsuario.findFirst.mockResolvedValue({ id: 'admin1' });
      await expect(
        service.actualizar('admin1', 's1', 'admin1', { activo: false }),
      ).rejects.toThrow(BadRequestException);
      expect(mockUsuario.update).not.toHaveBeenCalled();
    });

    it('rechaza que un admin se quite el rol de ADMIN a sí mismo', async () => {
      mockUsuario.findFirst.mockResolvedValue({ id: 'admin1' });
      await expect(
        service.actualizar('admin1', 's1', 'admin1', { rol: RolUsuario.CAJERO }),
      ).rejects.toThrow(BadRequestException);
    });

    it('permite que un admin se cambie a sí mismo otros campos (no rol ni desactivarse)', async () => {
      mockUsuario.findFirst.mockResolvedValue({ id: 'admin1' });
      mockUsuario.update.mockResolvedValue({ id: 'admin1', rol: RolUsuario.ADMIN, activo: true });
      const r = await service.actualizar('admin1', 's1', 'admin1', { activo: true });
      expect(r).toEqual({ id: 'admin1', rol: RolUsuario.ADMIN, activo: true });
    });

    it('actualiza rol y activo de otro usuario', async () => {
      mockUsuario.findFirst.mockResolvedValue({ id: 'u2' });
      mockUsuario.update.mockResolvedValue({ id: 'u2', rol: RolUsuario.SUPERVISOR, activo: false });
      const r = await service.actualizar('u2', 's1', 'admin1', {
        rol: RolUsuario.SUPERVISOR,
        activo: false,
      });
      expect(r).toEqual({ id: 'u2', rol: RolUsuario.SUPERVISOR, activo: false });
      expect(mockUsuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u2' },
          data: { rol: RolUsuario.SUPERVISOR, activo: false },
        }),
      );
    });
  });

  describe('obtenerFoto', () => {
    it('lanza NotFoundException si el usuario no es de esa sucursal', async () => {
      mockUsuario.findFirst.mockResolvedValue(null);
      await expect(service.obtenerFoto('u1', 's1')).rejects.toThrow(NotFoundException);
    });

    it('devuelve la foto del usuario', async () => {
      mockUsuario.findFirst.mockResolvedValue({ fotoBase64: 'data:image/png;base64,abc' });
      const r = await service.obtenerFoto('u1', 's1');
      expect(r).toEqual({ fotoBase64: 'data:image/png;base64,abc' });
    });

    it('devuelve null si el usuario no tiene foto', async () => {
      mockUsuario.findFirst.mockResolvedValue({ fotoBase64: null });
      const r = await service.obtenerFoto('u1', 's1');
      expect(r).toEqual({ fotoBase64: null });
    });
  });

  describe('actualizarFoto', () => {
    it('lanza NotFoundException si el usuario no es de esa sucursal', async () => {
      mockUsuario.findFirst.mockResolvedValue(null);
      await expect(service.actualizarFoto('u1', 's1', 'data:...')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockUsuario.update).not.toHaveBeenCalled();
    });

    it('guarda la foto como data URL', async () => {
      mockUsuario.findFirst.mockResolvedValue({ id: 'u1' });
      mockUsuario.update.mockResolvedValue({ fotoBase64: 'data:image/png;base64,abc' });

      const r = await service.actualizarFoto('u1', 's1', 'data:image/png;base64,abc');

      expect(r).toEqual({ fotoBase64: 'data:image/png;base64,abc' });
      expect(mockUsuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: { fotoBase64: 'data:image/png;base64,abc' },
        }),
      );
    });

    it('un string vacío borra la foto (null)', async () => {
      mockUsuario.findFirst.mockResolvedValue({ id: 'u1' });
      mockUsuario.update.mockResolvedValue({ fotoBase64: null });

      const r = await service.actualizarFoto('u1', 's1', '');

      expect(r).toEqual({ fotoBase64: null });
      expect(mockUsuario.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { fotoBase64: null } }),
      );
    });
  });
});
