import { Controller, Get, UseGuards } from '@nestjs/common';
import { RolUsuario } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AccesoRemotoService } from './acceso-remoto.service';

/**
 * Dirección pública del panel de este comercio (Fase 17.A, ADR-0055).
 *
 * Restringido a ADMIN/SUPERVISOR: los mismos roles que pueden entrar al
 * panel de reportes. Un cajero no necesita saber por dónde se llega al panel
 * desde afuera.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RolUsuario.ADMIN, RolUsuario.SUPERVISOR)
@Controller('acceso-remoto')
export class AccesoRemotoController {
  constructor(private readonly accesoRemoto: AccesoRemotoService) {}

  @Get()
  obtener() {
    return this.accesoRemoto.obtener();
  }
}
