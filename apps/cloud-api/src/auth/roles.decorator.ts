import { SetMetadata } from '@nestjs/common';
import { RolUsuario } from '@prisma/client';

/**
 * Clave de metadata donde el decorador guarda los roles permitidos.
 * La lee {@link RolesGuard} para autorizar (o no) el acceso a la ruta.
 */
export const ROLES_KEY = 'roles';

/**
 * Restringe una ruta a los roles indicados. Sin este decorador la ruta
 * queda abierta a cualquier usuario autenticado (el guard no exige roles).
 *
 * @example
 *   @Roles(RolUsuario.ADMIN, RolUsuario.SUPERVISOR)
 *   @Get()
 *   reporte() { ... }
 */
export const Roles = (...roles: RolUsuario[]) => SetMetadata(ROLES_KEY, roles);
