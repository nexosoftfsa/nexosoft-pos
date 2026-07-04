import { Module } from '@nestjs/common';
import { PresupuestosService } from './presupuestos.service';
import { PresupuestosController } from './presupuestos.controller';

@Module({
  providers: [PresupuestosService],
  controllers: [PresupuestosController],
  exports: [PresupuestosService],
})
export class PresupuestosModule {}
