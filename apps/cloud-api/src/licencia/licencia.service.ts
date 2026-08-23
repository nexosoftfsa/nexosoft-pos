import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { evaluarLicencia, type EstadoLicencia, type Licencia } from '@nexosoft/licencias';
import { PrismaService } from '../prisma/prisma.service';
import { LicenciasHttp, URL_LICENCIAS_DEFECTO } from './licencias-http';
import { verificarToken } from './verificar-firma';

/** Id fijo de la única fila de configuración (mismo patrón que ComercioService). */
const ID_CONFIG = 1;

/**
 * Estado de la suscripción del comercio (Fase 17.B, ADR-0056).
 *
 * Guarda la última licencia recibida **en la base**, no sólo en memoria: si
 * viviera en memoria, un comercio bloqueado se desbloquearía con sólo
 * reiniciar el servidor.
 *
 * Renueva una vez por día. Si no puede, sigue operando con lo que tenga: un
 * corte de internet nunca bloquea a nadie (ADR-0056 §3).
 */
@Injectable()
export class LicenciaService implements OnModuleInit {
  private readonly log = new Logger(LicenciaService.name);
  private licencia: Licencia | null = null;
  private comercioId: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.cargarGuardada();
    // No se espera: si el Worker no responde, el servidor tiene que arrancar
    // igual. La licencia guardada ya está cargada.
    void this.renovar();
  }

  /** Estado efectivo, que es lo que mira el guard y lo que muestra el POS. */
  estado(): EstadoLicencia {
    return evaluarLicencia(this.licencia);
  }

  /**
   * Renovación diaria. La hora es de madrugada a propósito: si el Worker
   * cambiara el estado a bloqueado, el corte no cae en medio de la jornada.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async renovar(): Promise<void> {
    const comercioId = this.comercioId ?? this.config.get<string>('LICENCIAS_COMERCIO_ID') ?? null;
    if (comercioId === null || comercioId === '') {
      // Instalación sin suscripción configurada todavía: no se controla nada.
      return;
    }
    const proveedor = new LicenciasHttp(
      this.config.get<string>('LICENCIAS_URL') ?? URL_LICENCIAS_DEFECTO,
      this.config.get<string>('LICENCIAS_CLAVE_PUBLICA') ?? '',
      this.config.get<string>('VERSION') ?? 'desconocida',
    );

    const obtenida = await proveedor.obtenerConToken(comercioId);
    if (obtenida === null) {
      this.log.warn('No se pudo renovar la licencia; se sigue con la última conocida.');
      return;
    }
    this.licencia = obtenida.licencia;
    this.comercioId = comercioId;
    await this.guardar(obtenida.token, comercioId);
    this.log.log(`Licencia renovada: ${obtenida.licencia.estado}`);
  }

  /** Lee de la base la última licencia recibida y la deja lista para usar. */
  private async cargarGuardada(): Promise<void> {
    let fila;
    try {
      fila = await this.prisma.configuracionSistema.findUnique({ where: { id: ID_CONFIG } });
    } catch {
      // Base no disponible al arrancar: se opera sin licencia (permisivo).
      return;
    }
    this.comercioId = fila?.licenciaComercioId ?? null;
    const token = fila?.licenciaToken ?? null;
    if (token === null) return;
    const clave = this.config.get<string>('LICENCIAS_CLAVE_PUBLICA') ?? '';
    if (clave === '') return;
    // Se vuelve a verificar la firma al leerla: que esté en nuestra base no
    // la vuelve confiable — alguien con acceso al Postgres podría haberla
    // editado para desbloquearse.
    this.licencia = verificarToken(token, clave);
    if (this.licencia === null) {
      this.log.warn('La licencia guardada no pasa la verificación; se ignora.');
    }
  }

  private async guardar(token: string, comercioId: string): Promise<void> {
    try {
      await this.prisma.configuracionSistema.upsert({
        where: { id: ID_CONFIG },
        create: { id: ID_CONFIG, licenciaToken: token, licenciaComercioId: comercioId },
        update: { licenciaToken: token, licenciaComercioId: comercioId },
      });
    } catch (e) {
      this.log.error(`No se pudo guardar la licencia: ${e instanceof Error ? e.message : e}`);
    }
  }
}
