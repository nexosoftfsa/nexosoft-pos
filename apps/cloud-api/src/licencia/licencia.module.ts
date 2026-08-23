import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { LicenciaController } from './licencia.controller';
import { LicenciaService } from './licencia.service';
import { LicenciaGuard } from './licencia.guard';

@Module({
  controllers: [LicenciaController],
  providers: [
    LicenciaService,
    // Global (ADR-0056 §4): el bloqueo por falta de pago tiene que aplicarse
    // a todas las operaciones, no sólo a las rutas de este módulo.
    { provide: APP_GUARD, useClass: LicenciaGuard },
  ],
  exports: [LicenciaService],
})
export class LicenciaModule {}
