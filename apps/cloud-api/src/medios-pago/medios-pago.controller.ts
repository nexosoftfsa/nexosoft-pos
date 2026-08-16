import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { MediosPagoService } from './medios-pago.service';
import { CrearTarjetaDto } from './dto/crear-tarjeta.dto';
import { ActualizarTarjetaDto } from './dto/actualizar-tarjeta.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface UsuarioJwt {
  id: string;
  sucursalId: string;
  rol: string;
}

@UseGuards(JwtAuthGuard)
@Controller('medios-pago')
export class MediosPagoController {
  constructor(private readonly mediosPagoService: MediosPagoService) {}

  @Get('tarjetas')
  listar(@Request() req: { user: UsuarioJwt }, @Query('todos') todos?: string) {
    return this.mediosPagoService.listarTarjetas(req.user.sucursalId, todos !== 'true');
  }

  @Post('tarjetas')
  crear(@Request() req: { user: UsuarioJwt }, @Body() dto: CrearTarjetaDto) {
    return this.mediosPagoService.crearTarjeta(req.user.sucursalId, dto);
  }

  @Get('tarjetas/:id')
  obtener(@Request() req: { user: UsuarioJwt }, @Param('id') id: string) {
    return this.mediosPagoService.obtenerTarjeta(req.user.sucursalId, id);
  }

  @Patch('tarjetas/:id')
  actualizar(
    @Request() req: { user: UsuarioJwt },
    @Param('id') id: string,
    @Body() dto: ActualizarTarjetaDto,
  ) {
    return this.mediosPagoService.actualizarTarjeta(req.user.sucursalId, id, dto);
  }

  @Delete('tarjetas/:id')
  desactivar(@Request() req: { user: UsuarioJwt }, @Param('id') id: string) {
    return this.mediosPagoService.desactivarTarjeta(req.user.sucursalId, id);
  }
}
