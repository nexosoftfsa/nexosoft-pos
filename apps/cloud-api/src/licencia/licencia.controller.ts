import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenciaService } from './licencia.service';

/**
 * Estado de la suscripción para el POS (Fase 17.B, ADR-0056).
 *
 * Cualquier usuario autenticado puede verlo: el cajero también necesita
 * entender por qué el sistema no lo deja vender. No expone el token ni nada
 * de la licencia más allá del estado y el aviso.
 */
@UseGuards(JwtAuthGuard)
@Controller('licencia')
export class LicenciaController {
  constructor(private readonly licencia: LicenciaService) {}

  @Get()
  estado() {
    return this.licencia.estado();
  }
}
