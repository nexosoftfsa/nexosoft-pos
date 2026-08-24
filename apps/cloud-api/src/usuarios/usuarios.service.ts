import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { RolUsuario } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { RevisionClavesService } from '../auth/revision-claves.service';

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

export interface CambioPassword {
  readonly passwordNueva: string;
  readonly passwordActual?: string | undefined;
}

@Injectable()
export class UsuariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly revisionClaves: RevisionClavesService,
  ) {}

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

  /**
   * Cambia la contraseña de un usuario (Fase 17.E).
   *
   * Faltaba: el POS avisa que hay contraseñas flojas antes de publicar el
   * panel en internet y manda a cambiarlas "en Usuarios", pero no existía
   * ninguna forma de cambiar una contraseña — ni acá ni en `auth`. El aviso
   * mandaba a una puerta que no estaba.
   */
  async cambiarPassword(
    id: string,
    sucursalId: string,
    solicitanteId: string,
    cambio: CambioPassword,
  ) {
    const usuario = await this.prisma.usuario.findFirst({
      where: { id, sucursalId },
      include: { sucursal: { select: { nombre: true } } },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');

    // La propia: hay que saber la actual. Ver CambiarPasswordDto para el
    // porqué. Un ADMIN cambiándole la clave a otro no la necesita.
    if (id === solicitanteId) {
      if (cambio.passwordActual === undefined || cambio.passwordActual === '') {
        throw new BadRequestException(
          'Para cambiar tu propia contraseña tenés que escribir la actual.',
        );
      }
      const actualOk = await argon2.verify(usuario.passwordHash, cambio.passwordActual);
      if (!actualOk) throw new UnauthorizedException('La contraseña actual no es correcta.');
      if (cambio.passwordActual === cambio.passwordNueva) {
        throw new BadRequestException('La contraseña nueva tiene que ser distinta de la actual.');
      }
    }

    await this.prisma.usuario.update({
      where: { id },
      data: { passwordHash: await argon2.hash(cambio.passwordNueva) },
    });

    // Se reevalúa acá mismo: es el otro momento (además del login) en que el
    // servidor ve una contraseña en claro. Así el aviso de "claves flojas" se
    // actualiza en el acto en vez de esperar a que la persona vuelva a entrar
    // — y si le pusieron otra floja, lo sigue diciendo.
    this.revisionClaves.revisar(usuario, cambio.passwordNueva, {
      email: usuario.email,
      nombreComercio: usuario.sucursal?.nombre,
    });

    return this.prisma.usuario.findUniqueOrThrow({ where: { id }, select: SELECT_PUBLICO });
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
