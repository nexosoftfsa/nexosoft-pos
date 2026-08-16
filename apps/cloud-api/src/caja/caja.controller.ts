import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { CajaService } from './caja.service';
import { AbrirTurnoDto } from './dto/abrir-turno.dto';
import { RegistrarMovimientoCajaDto } from './dto/registrar-movimiento-caja.dto';
import { CerrarTurnoDto } from './dto/cerrar-turno.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface UsuarioJwt {
  id: string;
  sucursalId: string;
  rol: string;
}

@UseGuards(JwtAuthGuard)
@Controller('caja')
export class CajaController {
  constructor(private readonly cajaService: CajaService) {}

  @Post('turnos')
  abrir(@Request() req: { user: UsuarioJwt }, @Body() dto: AbrirTurnoDto) {
    return this.cajaService.abrirTurno(req.user.sucursalId, req.user.id, dto);
  }

  @Get('turnos/actual')
  actual(@Request() req: { user: UsuarioJwt }, @Query('terminalId') terminalId: string) {
    return this.cajaService.turnoActual(req.user.sucursalId, terminalId);
  }

  @Get('turnos')
  historial(
    @Request() req: { user: UsuarioJwt },
    @Query('limite') limite?: string,
    @Query('terminalId') terminalId?: string,
  ) {
    return this.cajaService.listarTurnos(req.user.sucursalId, {
      ...(limite ? { limite: Number(limite) } : {}),
      ...(terminalId ? { terminalId } : {}),
    });
  }

  @Get('turnos/:id')
  obtener(@Request() req: { user: UsuarioJwt }, @Param('id') id: string) {
    return this.cajaService.obtenerTurno(req.user.sucursalId, id);
  }

  @Post('turnos/:id/movimientos')
  registrarMovimiento(
    @Request() req: { user: UsuarioJwt },
    @Param('id') id: string,
    @Body() dto: RegistrarMovimientoCajaDto,
  ) {
    return this.cajaService.registrarMovimiento(req.user.sucursalId, id, dto);
  }

  @Post('turnos/:id/cerrar')
  cerrar(
    @Request() req: { user: UsuarioJwt },
    @Param('id') id: string,
    @Body() dto: CerrarTurnoDto,
  ) {
    return this.cajaService.cerrarTurno(req.user.sucursalId, id, dto);
  }
}
