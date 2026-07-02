import { Module } from '@nestjs/common';
import { CajaService } from './caja.service';
import { CajaController } from './caja.controller';

@Module({
  providers: [CajaService],
  controllers: [CajaController],
  exports: [CajaService],
})
export class CajaModule {}
