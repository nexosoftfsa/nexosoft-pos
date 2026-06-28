import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolUsuario } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';

interface RequestConUsuario {
  user?: { rol?: string };
}

/**
 * Autoriza el acceso según el rol del usuario autenticado.
 *
 * Se usa SIEMPRE junto a {@link JwtAuthGuard} (que es quien puebla `req.user`),
 * y en ese orden: `@UseGuards(JwtAuthGuard, RolesGuard)`.
 *
 * Si la ruta no declara roles con `@Roles(...)`, deja pasar a cualquier
 * usuario autenticado.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rolesPermitidos = this.reflector.getAllAndOverride<RolUsuario[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!rolesPermitidos || rolesPermitidos.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<RequestConUsuario>();
    if (!user?.rol || !rolesPermitidos.includes(user.rol as RolUsuario)) {
      throw new ForbiddenException(
        'No tenés permisos para acceder a este recurso',
      );
    }

    return true;
  }
}
