import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { MotorDeRespaldo } from './motor-de-respaldo';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * Endpoints de respaldo. Sólo se exponen crear y listar.
 * La restauración es destructiva y NO se expone por HTTP (ADR-0020): se ejecuta
 * desde una herramienta de administración.
 *
 * TODO(4.x): restringir a rol ADMIN cuando exista RolesGuard.
 */
@UseGuards(JwtAuthGuard)
@Controller('respaldo')
export class RespaldoController {
  constructor(private readonly motor: MotorDeRespaldo) {}

  @Post()
  crear() {
    return this.motor.crearRespaldo();
  }

  @Get()
  listar() {
    return this.motor.listarRespaldos();
  }
}
