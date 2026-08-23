import { Module } from '@nestjs/common';
import { AccesoRemotoController } from './acceso-remoto.controller';
import { AccesoRemotoService } from './acceso-remoto.service';

@Module({
  controllers: [AccesoRemotoController],
  providers: [AccesoRemotoService],
})
export class AccesoRemotoModule {}
