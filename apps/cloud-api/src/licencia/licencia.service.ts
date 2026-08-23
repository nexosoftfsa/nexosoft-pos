import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { evaluarLicencia, type EstadoLicencia, type Licencia } from '@nexosoft/licencias';
import { PrismaService } from '../prisma/prisma.service';
import { CLAVE_PUBLICA_LICENCIAS } from './clave-publica';
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
   * Renovación **cada 5 minutos**, más el arranque del servidor.
   *
   * No puede ser instantáneo: el servidor del comercio es una PC detrás del
   * router de un local, sin dirección pública a la que podamos llamar. El
   * modelo es **pull** — es él quien nos consulta. Lo único que elegimos es
   * cada cuánto.
   *
   * Se probó con una hora y estaba mal por dos motivos. Uno: la cuota no era
   * el problema que yo suponía (50 comercios cada 5 minutos son ~14.000
   * pedidos diarios, y el plan gratuito da 100.000). Dos: el POS a su vez
   * consulta a su servidor, así que los tiempos se SUMAN — con ambos en una
   * hora, un cambio podía tardar dos.
   *
   * Lo que manda es la asimetría: cuando un comercio **paga**, quiere volver
   * a vender ya. Que el desbloqueo tarde minutos es aceptable; que tarde
   * horas, no.
   *
   * Contrapartida asumida: un bloqueo puede caer con el local abierto. Por eso
   * conviene apretar el botón de noche, y por eso el POS deja igual cerrar la
   * caja y ver lo histórico (ADR-0056 §4).
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async renovar(): Promise<void> {
    const comercioId = this.comercioId ?? this.config.get<string>('LICENCIAS_COMERCIO_ID') ?? null;
    if (comercioId === null || comercioId === '') {
      // Instalación sin suscripción configurada todavía: no se controla nada.
      return;
    }
    const proveedor = new LicenciasHttp(
      this.config.get<string>('LICENCIAS_URL') ?? URL_LICENCIAS_DEFECTO,
      this.clavePublica(),
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

  /**
   * La clave pública viene embebida (la misma para todos los comercios) y se
   * puede pisar por entorno para pruebas o para una rotación de emergencia.
   */
  private clavePublica(): string {
    const delEntorno = (this.config.get<string>('LICENCIAS_CLAVE_PUBLICA') ?? '').trim();
    return delEntorno !== '' ? delEntorno : CLAVE_PUBLICA_LICENCIAS;
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
    // Se vuelve a verificar la firma al leerla: que esté en nuestra base no
    // la vuelve confiable — alguien con acceso al Postgres podría haberla
    // editado para desbloquearse.
    this.licencia = verificarToken(token, this.clavePublica());
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
