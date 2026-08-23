import { Injectable, Logger } from '@nestjs/common';
import type { Licencia, ProveedorLicencias } from '@nexosoft/licencias';
import { verificarToken } from './verificar-firma';

/** Cuánto se espera al Worker antes de darlo por no disponible. */
const TIMEOUT_MS = 8_000;

export const URL_LICENCIAS_DEFECTO = 'https://licencias.nexosoft.com.ar';

export interface LicenciaObtenida {
  readonly licencia: Licencia;
  /** El token tal cual vino, para guardarlo y poder reusarlo sin red. */
  readonly token: string;
}

/**
 * Proveedor real de licencias: habla con nuestro Worker (ADR-0056 §1).
 *
 * De paso hace el **heartbeat de soporte** (§7): le cuenta al Worker qué
 * versión tiene instalada este comercio y cuándo fue el último contacto. No
 * viaja ningún dato del negocio — ni ventas, ni clientes, ni montos.
 *
 * **Nunca lanza.** Sin internet, con el Worker caído o con una respuesta
 * corrupta devuelve `null`, y quien llama sigue con la última licencia
 * guardada (ADR-0056 §3).
 */
@Injectable()
export class LicenciasHttp implements ProveedorLicencias {
  private readonly log = new Logger(LicenciasHttp.name);

  constructor(
    private readonly url: string,
    private readonly clavePublicaBase64: string,
    private readonly versionInstalada: string,
  ) {}

  async obtener(comercioId: string): Promise<Licencia | null> {
    return (await this.obtenerConToken(comercioId))?.licencia ?? null;
  }

  /** Igual que `obtener`, pero devuelve también el token crudo para persistirlo. */
  async obtenerConToken(comercioId: string): Promise<LicenciaObtenida | null> {
    if (this.clavePublicaBase64 === '') {
      // Sin clave pública configurada no hay forma de confiar en nada de lo
      // que responda el Worker. Se comporta como "no hay licencia", que deja
      // operar: nunca como un bloqueo.
      this.log.warn('Sin LICENCIAS_CLAVE_PUBLICA configurada: no se valida la suscripción.');
      return null;
    }

    let respuesta: Response;
    try {
      respuesta = await fetch(`${this.url}/licencia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comercioId, version: this.versionInstalada }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      // Sin internet o Worker caído: silencioso a propósito, es la situación
      // esperable varias veces al día en un comercio.
      return null;
    }

    if (!respuesta.ok) {
      this.log.warn(`El servicio de licencias respondió ${respuesta.status}.`);
      return null;
    }

    let token: unknown;
    try {
      token = ((await respuesta.json()) as { token?: unknown }).token;
    } catch {
      return null;
    }
    if (typeof token !== 'string' || token === '') return null;

    const licencia = verificarToken(token, this.clavePublicaBase64);
    if (licencia === null) {
      this.log.error('El servicio de licencias devolvió un token que no pasa la verificación.');
      return null;
    }
    if (licencia.comercioId !== comercioId) {
      // Una licencia de OTRO comercio, aunque esté bien firmada, no vale acá.
      this.log.error(
        `La licencia recibida es de "${licencia.comercioId}" y este comercio es "${comercioId}".`,
      );
      return null;
    }
    return { licencia, token };
  }
}
