import { Module } from '@nestjs/common';
import { AsistenteController } from './asistente.controller';
import { AsistenteService } from './asistente.service';

@Module({
  controllers: [AsistenteController],
  providers: [AsistenteService],
})
export class AsistenteModule {}
