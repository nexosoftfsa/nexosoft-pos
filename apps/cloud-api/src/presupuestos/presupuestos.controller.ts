import { Controller, Get, Post, Param, Body, UseGuards, Request } from '@nestjs/common';
import { PresupuestosService } from './presupuestos.service';
import { CrearPresupuestoDto } from './dto/crear-presupuesto.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface UsuarioJwt {
  id: string;
  sucursalId: string;
  rol: string;
}

@UseGuards(JwtAuthGuard)
@Controller('presupuestos')
export class PresupuestosController {
  constructor(private readonly presupuestos: PresupuestosService) {}

  @Get()
  listar(@Request() req: { user: UsuarioJwt }) {
    return this.presupuestos.listar(req.user.sucursalId);
  }

  @Post()
  crear(@Request() req: { user: UsuarioJwt }, @Body() dto: CrearPresupuestoDto) {
    return this.presupuestos.crear(req.user.sucursalId, dto);
  }

  @Get(':id')
  obtener(@Request() req: { user: UsuarioJwt }, @Param('id') id: string) {
    return this.presupuestos.obtener(req.user.sucursalId, id);
  }

  @Post(':id/convertir')
  convertir(@Request() req: { user: UsuarioJwt }, @Param('id') id: string) {
    return this.presupuestos.convertir(req.user.sucursalId, id);
  }

  @Post(':id/anular')
  anular(@Request() req: { user: UsuarioJwt }, @Param('id') id: string) {
    return this.presupuestos.anular(req.user.sucursalId, id);
  }
}
