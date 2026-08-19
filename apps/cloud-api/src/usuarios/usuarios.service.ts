import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RolUsuario } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const SELECT_PUBLICO = {
  id: true,
  email: true,
  nombreDisplay: true,
  rol: true,
  activo: true,
  creadoEn: true,
} as const;

export interface CambiosUsuario {
  readonly rol?: RolUsuario;
  readonly activo?: boolean;
}

export interface EstadoFoto {
  readonly fotoBase64: string | null;
}

@Injectable()
export class UsuariosService {
  constructor(private readonly prisma: PrismaService) {}

  listar(sucursalId: string) {
    return this.prisma.usuario.findMany({
      where: { sucursalId },
      select: SELECT_PUBLICO,
      orderBy: { creadoEn: 'asc' },
    });
  }

  async actualizar(
    id: string,
    sucursalId: string,
    solicitanteId: string,
    cambios: CambiosUsuario,
  ) {
    // No puede tocar usuarios de otra sucursal (ni siquiera para saber si existen).
    const existe = await this.prisma.usuario.findFirst({ where: { id, sucursalId } });
    if (!existe) throw new NotFoundException('Usuario no encontrado');

    // Un ADMIN no puede desactivarse ni quitarse el rol a sí mismo: es la forma
    // más común de quedar todos bloqueados afuera del sistema por accidente.
    if (id === solicitanteId) {
      if (cambios.activo === false) {
        throw new BadRequestException('No podés desactivar tu propio usuario.');
      }
      if (cambios.rol !== undefined && cambios.rol !== RolUsuario.ADMIN) {
        throw new BadRequestException('No podés quitarte el rol de administrador a vos mismo.');
      }
    }

    return this.prisma.usuario.update({
      where: { id },
      data: {
        ...(cambios.rol !== undefined ? { rol: cambios.rol } : {}),
        ...(cambios.activo !== undefined ? { activo: cambios.activo } : {}),
      },
      select: SELECT_PUBLICO,
    });
  }

  // Endpoint separado del listado/`actualizar()`: GET /usuarios no debe traer
  // el base64 de cada fila (mismo criterio que ComercioService con el logo).
  async obtenerFoto(id: string, sucursalId: string): Promise<EstadoFoto> {
    const usuario = await this.prisma.usuario.findFirst({
      where: { id, sucursalId },
      select: { fotoBase64: true },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');
    return { fotoBase64: usuario.fotoBase64 };
  }

  async actualizarFoto(id: string, sucursalId: string, fotoBase64: string): Promise<EstadoFoto> {
    const existe = await this.prisma.usuario.findFirst({ where: { id, sucursalId } });
    if (!existe) throw new NotFoundException('Usuario no encontrado');

    const valor = fotoBase64.trim() === '' ? null : fotoBase64;
    const actualizado = await this.prisma.usuario.update({
      where: { id },
      data: { fotoBase64: valor },
      select: { fotoBase64: true },
    });
    return { fotoBase64: actualizado.fotoBase64 };
  }
}
