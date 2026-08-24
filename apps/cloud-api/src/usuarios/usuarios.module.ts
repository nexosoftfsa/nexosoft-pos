import { Module } from '@nestjs/common';
import { UsuariosController } from './usuarios.controller';
import { UsuariosService } from './usuarios.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  // Por RevisionClavesService: al cambiar una contraseña hay que reevaluar si
  // sigue siendo floja para exponerla a internet (Fase 17.C).
  imports: [AuthModule],
  controllers: [UsuariosController],
  providers: [UsuariosService],
})
export class UsuariosModule {}
