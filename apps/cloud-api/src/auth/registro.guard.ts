import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { RolUsuario } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';

interface RequestConUsuario {
  user?: { rol?: string };
}

/**
 * Autoriza POST /auth/register:
 * - Si todavía no hay ningún usuario (instalación nueva), deja pasar sin
 *   autenticación — es el alta del primer ADMIN.
 * - A partir del primer usuario, exige sesión de ADMIN (vía JwtAuthGuard).
 *   La ventana de registro público se cierra sola apenas existe un usuario.
 */
@Injectable()
export class RegistroGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtAuthGuard: JwtAuthGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const totalUsuarios = await this.prisma.usuario.count();
    if (totalUsuarios === 0) return true;

    const autenticado = (await this.jwtAuthGuard.canActivate(context)) as boolean;
    if (!autenticado) {
      throw new UnauthorizedException('Se requiere sesión de administrador para crear usuarios');
    }

    const { user } = context.switchToHttp().getRequest<RequestConUsuario>();
    if (user?.rol !== RolUsuario.ADMIN) {
      throw new ForbiddenException('Solo un ADMIN puede crear usuarios nuevos');
    }

    return true;
  }
}
