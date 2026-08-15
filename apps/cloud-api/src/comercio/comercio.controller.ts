import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { RolUsuario } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ComercioService } from './comercio.service';
import { ActualizarLogoDto } from './dto/actualizar-logo.dto';

@UseGuards(JwtAuthGuard)
@Controller('comercio')
export class ComercioController {
  constructor(private readonly comercio: ComercioService) {}

  // Cualquier usuario autenticado puede verlo (no es sensible, es branding).
  @Get('logo')
  obtenerLogo() {
    return this.comercio.obtenerLogo();
  }

  // Cambiarlo sí queda restringido a ADMIN.
  @UseGuards(RolesGuard)
  @Roles(RolUsuario.ADMIN)
  @Put('logo')
  actualizarLogo(@Body() dto: ActualizarLogoDto) {
    return this.comercio.actualizarLogo(dto.logoBase64);
  }
}
