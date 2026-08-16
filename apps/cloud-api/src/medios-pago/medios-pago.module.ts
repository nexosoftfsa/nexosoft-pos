import { Module } from '@nestjs/common';
import { MediosPagoService } from './medios-pago.service';
import { MediosPagoController } from './medios-pago.controller';

@Module({
  providers: [MediosPagoService],
  controllers: [MediosPagoController],
  exports: [MediosPagoService],
})
export class MediosPagoModule {}
