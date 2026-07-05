import { Module } from '@nestjs/common';
import { PresupuestosService } from './presupuestos.service';
import { PresupuestosController } from './presupuestos.controller';
import { VentasModule } from '../ventas/ventas.module';

@Module({
  imports: [VentasModule], // convertir un presupuesto genera una venta real
  providers: [PresupuestosService],
  controllers: [PresupuestosController],
  exports: [PresupuestosService],
})
export class PresupuestosModule {}
