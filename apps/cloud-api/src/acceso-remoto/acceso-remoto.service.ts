import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import {
  type AccesoRemoto,
  type ClaveDebilExpuesta,
  NO_CONFIGURADO,
  type RespuestaAccesoRemoto,
  parsearEstadoAccesoRemoto,
} from './estado-acceso-remoto';
import { RevisionClavesService } from '../auth/revision-claves.service';

/**
 * Misma convención de carpeta de datos que
 * `scripts/instalacion/bootstrap-servidor-standalone.ps1` (`-RaizDatos`).
 * Se puede pisar con `ACCESO_REMOTO_ARCHIVO` (instalaciones fuera de la
 * convención, y los tests).
 */
const RUTA_DEFECTO = join(
  process.env['ProgramData'] ?? 'C:\\ProgramData',
  'NexoSoft',
  'acceso-remoto.json',
);

/**
 * Cuánto vale una comprobación de "¿se ve desde afuera?" antes de repetirla.
 * La pantalla del POS puede refrescarse varias veces seguidas; sin caché eso
 * serían varias vueltas completas a Cloudflare por cada clic.
 */
const CACHE_MS = 30_000;
const TIMEOUT_MS = 6_000;

/**
 * El hostname público se consulta en cada request (ver `hostnamePublico`), así
 * que se cachea corto: suficiente para no leer el archivo mil veces por
 * segundo, y lo bastante breve como para que activar o desactivar el acceso
 * remoto tenga efecto enseguida.
 */
const CACHE_HOSTNAME_MS = 10_000;

/**
 * Estado del acceso remoto del comercio (Fase 17.A, ADR-0055): la dirección
 * pública fija que atiende el túnel de Cloudflare, y si responde ahora.
 *
 * El alta y la baja del túnel las hace un script elevado
 * (`instalar-acceso-remoto.ps1`); este servicio es de solo lectura y nunca
 * ve el token del túnel — vive en otro archivo con ACL cerrada.
 */
@Injectable()
export class AccesoRemotoService {
  private cache: { url: string; alcanzable: boolean; cuando: number } | null = null;
  private cacheHostname: { hostname: string | null; cuando: number } | null = null;

  constructor(private readonly revisionClaves: RevisionClavesService) {}

  private get ruta(): string {
    return process.env['ACCESO_REMOTO_ARCHIVO'] ?? RUTA_DEFECTO;
  }

  /**
   * Hostname público del comercio (`lagus.nexosoft.com.ar`), o `null` si esta
   * PC no tiene acceso remoto. Lo usa `RestriccionRemotaGuard` para reconocer
   * una petición que entró por el túnel, así que se consulta en **cada
   * request**: de ahí la caché en memoria y que sólo lea el archivo, sin
   * tocar la red.
   */
  async hostnamePublico(): Promise<string | null> {
    const ahora = Date.now();
    if (this.cacheHostname !== null && ahora - this.cacheHostname.cuando < CACHE_HOSTNAME_MS) {
      return this.cacheHostname.hostname;
    }
    let hostname: string | null = null;
    try {
      const estado = parsearEstadoAccesoRemoto(await readFile(this.ruta, 'utf8'));
      if (estado?.estado === 'activo' && estado.url !== null) {
        hostname = new URL(estado.url).hostname;
      }
    } catch {
      hostname = null;
    }
    this.cacheHostname = { hostname, cuando: ahora };
    return hostname;
  }

  /**
   * Estado del túnel + los avisos de seguridad que correspondan a quien
   * pregunta (Fase 17.C).
   */
  async obtenerPara(solicitante: { id: string; rol: string }): Promise<RespuestaAccesoRemoto> {
    const estado = await this.obtener();
    return { ...estado, clavesDebiles: this.clavesDebilesPara(solicitante) };
  }

  private clavesDebilesPara(solicitante: { id: string; rol: string }): ClaveDebilExpuesta[] {
    const aExpuesta = (c: { email: string; rol: string; motivo: string }): ClaveDebilExpuesta => ({
      email: c.email,
      rol: c.rol,
      motivo: c.motivo,
    });
    if (solicitante.rol === 'ADMIN') return this.revisionClaves.listar().map(aExpuesta);
    const propia = this.revisionClaves.deUsuario(solicitante.id);
    return propia === null ? [] : [aExpuesta(propia)];
  }

  async obtener(): Promise<AccesoRemoto> {
    let texto: string;
    try {
      texto = await readFile(this.ruta, 'utf8');
    } catch {
      // No existe el archivo: en esta PC nunca se dio de alta el acceso
      // remoto. No es un error, es el caso normal de un comercio que todavía
      // no lo tiene contratado.
      return NO_CONFIGURADO;
    }

    const estado = parsearEstadoAccesoRemoto(texto);
    if (estado === null) {
      return {
        ...NO_CONFIGURADO,
        mensaje: 'No se pudo leer el estado del acceso remoto en esta PC.',
      };
    }
    if (estado.estado !== 'activo' || estado.url === null) return estado;

    return { ...estado, alcanzable: await this.comprobarAlcanzable(estado.url) };
  }

  /**
   * Pega en el `/health` del propio servidor pero **por la dirección
   * pública**: sale a internet, pasa por Cloudflare y vuelve por el túnel. Si
   * esto responde, el dueño lo va a poder abrir desde el celular; si no,
   * cualquier cosa de esa cadena está cortada.
   */
  private async comprobarAlcanzable(url: string): Promise<boolean> {
    const ahora = Date.now();
    if (this.cache !== null && this.cache.url === url && ahora - this.cache.cuando < CACHE_MS) {
      return this.cache.alcanzable;
    }
    let alcanzable = false;
    try {
      const r = await fetch(`${url}/api/v1/health`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      alcanzable = r.ok;
    } catch {
      alcanzable = false;
    }
    this.cache = { url, alcanzable, cuando: ahora };
    return alcanzable;
  }
}
