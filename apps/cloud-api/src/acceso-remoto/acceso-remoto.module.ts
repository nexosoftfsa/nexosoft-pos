import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccesoRemotoController } from './acceso-remoto.controller';
import { AccesoRemotoService } from './acceso-remoto.service';
import { RestriccionRemotaGuard } from './restriccion-remota.guard';
import { AuthModule } from '../auth/auth.module';

@Module({
  // Por RevisionClavesService: el aviso de contraseña débil antes de publicar
  // el panel (Fase 17.C).
  imports: [AuthModule],
  controllers: [AccesoRemotoController],
  providers: [
    AccesoRemotoService,
    // Global (ADR-0057): todo lo que entra por el túnel pasa por acá, no sólo
    // las rutas de este módulo. Se declara desde este módulo para que la
    // decisión viva junto al resto del acceso remoto.
    { provide: APP_GUARD, useClass: RestriccionRemotaGuard },
  ],
})
export class AccesoRemotoModule {}
