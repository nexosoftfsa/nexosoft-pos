import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { RolUsuario } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AsistenteService } from './asistente.service';
import { PreguntarDto } from './dto/preguntar.dto';
import { ActualizarConfiguracionDto } from './dto/actualizar-configuracion.dto';

@UseGuards(JwtAuthGuard)
@Controller('asistente')
export class AsistenteController {
  constructor(private readonly asistente: AsistenteService) {}

  @Post('preguntar')
  async preguntar(@Body() dto: PreguntarDto) {
    const respuesta = await this.asistente.preguntar(dto.pregunta);
    return { respuesta };
  }

  // Configurar la clave de Gemini es sensible: solo ADMIN.
  @UseGuards(RolesGuard)
  @Roles(RolUsuario.ADMIN)
  @Get('configuracion')
  obtenerConfiguracion() {
    return this.asistente.obtenerConfiguracion();
  }

  @UseGuards(RolesGuard)
  @Roles(RolUsuario.ADMIN)
  @Put('configuracion')
  actualizarConfiguracion(@Body() dto: ActualizarConfiguracionDto) {
    return this.asistente.actualizarConfiguracion(dto.apiKey, dto.modelo);
  }
}
