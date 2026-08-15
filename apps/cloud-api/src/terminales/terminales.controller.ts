import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { RolUsuario } from '@prisma/client';
import { TerminalesService } from './terminales.service';
import { CrearTerminalDto } from './dto/crear-terminal.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

interface UsuarioJwt {
  id: string;
  sucursalId: string;
  rol: string;
}

@UseGuards(JwtAuthGuard)
@Controller('terminales')
export class TerminalesController {
  constructor(private readonly terminalesService: TerminalesService) {}

  @Get()
  listar(@Request() req: { user: UsuarioJwt }) {
    return this.terminalesService.listar(req.user.sucursalId);
  }

  @UseGuards(RolesGuard)
  @Roles(RolUsuario.ADMIN, RolUsuario.SUPERVISOR)
  @Post()
  crear(@Request() req: { user: UsuarioJwt }, @Body() dto: CrearTerminalDto) {
    return this.terminalesService.crear(req.user.sucursalId, dto);
  }
}
