import { Module } from '@nestjs/common';
import { AccesoRemotoController } from './acceso-remoto.controller';
import { AccesoRemotoService } from './acceso-remoto.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  // Por RevisionClavesService: el aviso de contraseña débil antes de publicar
  // el panel (Fase 17.C).
  imports: [AuthModule],
  controllers: [AccesoRemotoController],
  providers: [AccesoRemotoService],
})
export class AccesoRemotoModule {}
