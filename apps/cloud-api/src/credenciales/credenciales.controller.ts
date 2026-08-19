import { Controller, Delete, Get, Param, Post, UseGuards, Request } from '@nestjs/common';
import { RolUsuario } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CredencialesService } from './credenciales.service';

interface UsuarioJwt {
  id: string;
  sucursalId: string;
  rol: string;
}

// Gestionar la credencial de acceso de cualquier usuario es sensible: solo
// ADMIN, ni siquiera autogestión (mismo criterio que UsuariosController).
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RolUsuario.ADMIN)
@Controller('usuarios/:id/credencial')
export class CredencialesController {
  constructor(private readonly credenciales: CredencialesService) {}

  @Get()
  obtenerEstado(@Request() req: { user: UsuarioJwt }, @Param('id') id: string) {
    return this.credenciales.obtenerEstado(id, req.user.sucursalId);
  }

  @Post('regenerar')
  regenerar(@Request() req: { user: UsuarioJwt }, @Param('id') id: string) {
    return this.credenciales.regenerar(id, req.user.sucursalId);
  }

  @Delete()
  revocar(@Request() req: { user: UsuarioJwt }, @Param('id') id: string) {
    return this.credenciales.revocar(id, req.user.sucursalId);
  }
}
