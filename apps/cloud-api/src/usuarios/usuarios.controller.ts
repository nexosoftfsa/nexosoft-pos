import { Body, Controller, Get, Param, Patch, UseGuards, Request } from '@nestjs/common';
import { RolUsuario } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UsuariosService } from './usuarios.service';
import { ActualizarUsuarioDto } from './dto/actualizar-usuario.dto';

interface UsuarioJwt {
  id: string;
  sucursalId: string;
  rol: string;
}

// Gestión de usuarios (rol/activo) es sensible: solo ADMIN, a diferencia del
// resto de los módulos de gestión (que también dejan pasar a SUPERVISOR).
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RolUsuario.ADMIN)
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Get()
  listar(@Request() req: { user: UsuarioJwt }) {
    return this.usuarios.listar(req.user.sucursalId);
  }

  @Patch(':id')
  actualizar(
    @Request() req: { user: UsuarioJwt },
    @Param('id') id: string,
    @Body() dto: ActualizarUsuarioDto,
  ) {
    return this.usuarios.actualizar(id, req.user.sucursalId, req.user.id, dto);
  }
}
