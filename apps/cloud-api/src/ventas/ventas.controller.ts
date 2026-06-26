import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { VentasService } from './ventas.service';
import { CrearVentaDto } from './dto/crear-venta.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface UsuarioJwt {
  id: string;
  email: string;
  sucursalId: string;
  rol: string;
}

@UseGuards(JwtAuthGuard)
@Controller('ventas')
export class VentasController {
  constructor(private readonly ventasService: VentasService) {}

  @Get()
  historial(@Request() req: { user: UsuarioJwt }) {
    return this.ventasService.historial(req.user.sucursalId);
  }

  @Post()
  registrar(@Request() req: { user: UsuarioJwt }, @Body() dto: CrearVentaDto) {
    return this.ventasService.registrar(
      { id: req.user.id, email: req.user.email, sucursalId: req.user.sucursalId },
      dto,
    );
  }
}
