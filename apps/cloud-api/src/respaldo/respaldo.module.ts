import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MotorDeRespaldo } from './motor-de-respaldo';
import { RespaldoController } from './respaldo.controller';
import { RespaldoSchedulerService } from './respaldo-scheduler.service';
import {
  DESTINO_DE_RESPALDO,
  type DestinoDeRespaldo,
} from './puertos/destino-de-respaldo';
import { DestinoCarpeta } from './destinos/destino-carpeta';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [RespaldoController],
  providers: [
    {
      // Resuelve el destino activo según configuración (ADR-0020).
      // Hoy: carpeta (filesystem). Mañana: nube vía API, sin tocar el resto.
      provide: DESTINO_DE_RESPALDO,
      useFactory: (config: ConfigService): DestinoDeRespaldo => {
        const ruta = config.get<string>('RESPALDO_RUTA') ?? './respaldos';
        return new DestinoCarpeta(ruta);
      },
      inject: [ConfigService],
    },
    {
      provide: MotorDeRespaldo,
      useFactory: (
        prisma: PrismaService,
        destino: DestinoDeRespaldo,
        config: ConfigService,
      ) => {
        const retener = parseInt(config.get<string>('RESPALDO_RETENER') ?? '7', 10);
        return new MotorDeRespaldo(prisma, destino, retener);
      },
      inject: [PrismaService, DESTINO_DE_RESPALDO, ConfigService],
    },
    RespaldoSchedulerService,
  ],
  exports: [MotorDeRespaldo],
})
export class RespaldoModule {}
