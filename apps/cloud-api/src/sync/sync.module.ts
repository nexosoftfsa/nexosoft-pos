import { Module } from '@nestjs/common';
import { SyncService } from './sync.service';
import { SyncController } from './sync.controller';
import { VentasModule } from '../ventas/ventas.module';

@Module({
  imports: [VentasModule], // aporta VentasService para aplicar operaciones de venta
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
