import { Controller, Get } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';

/**
 * `VERSION` la escribe scripts/release/publicar-instalador-servidor.ps1 en
 * la raiz de dist-servidor/ al publicar (Fase 13.D); en dev no existe.
 * La lee el actualizador del servidor (Fase 13.E) via /health, ademas de
 * leer el archivo directamente -- sirve como chequeo cruzado.
 */
function leerVersion(): string {
  try {
    return readFileSync(join(process.cwd(), 'VERSION'), 'utf-8').trim();
  } catch {
    return 'dev';
  }
}

const VERSION = leerVersion();

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', db: 'ok', version: VERSION, ts: new Date().toISOString() };
    } catch {
      return { status: 'degraded', db: 'error', version: VERSION, ts: new Date().toISOString() };
    }
  }
}
