import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { MotorDeRespaldo } from './motor-de-respaldo';

/**
 * Programa respaldos automáticos según `RESPALDO_CRON` (expresión cron).
 * Si la variable no está configurada, no registra ningún job: el respaldo
 * queda sólo manual (endpoint) o al cerrar caja (lo dispara el POS).
 */
@Injectable()
export class RespaldoSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(RespaldoSchedulerService.name);

  constructor(
    private readonly motor: MotorDeRespaldo,
    private readonly config: ConfigService,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    const expresion = this.config.get<string>('RESPALDO_CRON');
    if (!expresion) {
      this.logger.log('Respaldo automático desactivado (sin RESPALDO_CRON).');
      return;
    }

    const job = new CronJob(expresion, () => {
      void this.ejecutar();
    });

    this.scheduler.addCronJob('respaldo-automatico', job as never);
    job.start();
    this.logger.log(`Respaldo automático programado: ${expresion}`);
  }

  private async ejecutar(): Promise<void> {
    try {
      const meta = await this.motor.crearRespaldo();
      this.logger.log(`Respaldo automático OK: ${meta.nombre}`);
    } catch (error) {
      this.logger.error(`Falló el respaldo automático: ${(error as Error).message}`);
    }
  }
}
