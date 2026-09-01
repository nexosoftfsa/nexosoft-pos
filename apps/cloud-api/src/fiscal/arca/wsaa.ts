import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { firmarTraCms } from './firma-cms';
import { construirTra, leerFaultSoap, leerTicketAcceso, type TicketAcceso } from './tra';
import { esCorteDeTiempo } from './corte-de-tiempo';
import { detalleDeRed } from './detalle-de-red';
import { fetchArca, type FetchLike, type RespuestaHttp } from './fetch-arca';

/**
 * WSAA: el servicio de autenticación de ARCA.
 *
 * Devuelve un "ticket de acceso" (token + firma) que dura 12 horas y que
 * después viaja en cada llamada al servicio de facturación.
 *
 * El ticket se CACHEA en disco, y no es una optimización: ARCA rechaza pedir
 * uno nuevo mientras haya otro vigente ("El CEE ya posee un TA valido"). Si el
 * servidor se reiniciara y perdiera el ticket, el comercio quedaría sin poder
 * facturar hasta que venciera el anterior — hasta 12 horas.
 */

export const URL_WSAA = {
  homologacion: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
  produccion: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
} as const;

export type EntornoArca = keyof typeof URL_WSAA;

export class ErrorWsaa extends Error {
  constructor(
    message: string,
    /** true si conviene reintentar (red, servicio caído). */
    readonly transitorio: boolean,
  ) {
    super(message);
    this.name = 'ErrorWsaa';
  }
}

/** Margen antes del vencimiento para pedir uno nuevo. */
const MARGEN_RENOVACION_MS = 10 * 60_000;

/**
 * Cuánto se espera a WSAA. Más corto que el de facturación: acá todavía no se
 * mandó ningún comprobante, así que cortar temprano no deja nada en duda.
 */
export const TIMEOUT_WSAA_MS = 15_000;

interface TicketEnDisco {
  token: string;
  sign: string;
  expiracion: string;
}

export class ClienteWsaa {
  private enMemoria: TicketAcceso | null = null;

  constructor(
    private readonly opciones: {
      readonly entorno: EntornoArca;
      readonly certificadoPem: string;
      readonly clavePrivadaPem: string;
      /** Dónde cachear el ticket. Debe sobrevivir a un reinicio. */
      readonly rutaCache: string;
      readonly url?: string;
      /** Inyectable para tests. */
      readonly fetchImpl?: FetchLike;
      readonly timeoutMs?: number;
    },
  ) {}

  /** Ticket vigente para el servicio pedido (`wsfe` para facturación). */
  async obtenerTicket(servicio = 'wsfe'): Promise<TicketAcceso> {
    const cacheado = this.enMemoria ?? this.leerDeDisco();
    if (cacheado !== null && this.sirve(cacheado)) {
      this.enMemoria = cacheado;
      return cacheado;
    }
    const ticket = await this.pedirNuevo(servicio);
    this.enMemoria = ticket;
    this.guardarEnDisco(ticket);
    return ticket;
  }

  private sirve(t: TicketAcceso): boolean {
    return t.expiracion.getTime() - MARGEN_RENOVACION_MS > Date.now();
  }

  private async pedirNuevo(servicio: string): Promise<TicketAcceso> {
    const tra = construirTra({ servicio });
    const cms = firmarTraCms(tra, this.opciones.certificadoPem, this.opciones.clavePrivadaPem);
    const url = this.opciones.url ?? URL_WSAA[this.opciones.entorno];
    const hacerFetch = this.opciones.fetchImpl ?? fetchArca;

    const timeoutMs = this.opciones.timeoutMs ?? TIMEOUT_WSAA_MS;
    let res: RespuestaHttp;
    try {
      res = await hacerFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
        body: sobreLoginCms(cms),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      if (esCorteDeTiempo(e)) {
        throw new ErrorWsaa(
          `ARCA no respondió en ${Math.round(timeoutMs / 1000)} segundos al autenticar.`,
          true,
        );
      }
      throw new ErrorWsaa(`No se pudo contactar a ARCA: ${detalleDeRed(e)}`, true);
    }

    const cuerpo = await res.text();
    const fault = leerFaultSoap(cuerpo);
    if (fault !== null) {
      // Este es el caso que hace imprescindible el caché: ya hay un ticket
      // vivo del lado de ARCA y el nuestro se perdió. No se arregla
      // reintentando, hay que esperar a que venza.
      if (/ya posee un TA valido/i.test(fault)) {
        throw new ErrorWsaa(
          'ARCA dice que ya hay un ticket de acceso vigente para este certificado. Puede pasar si el servidor se reinstaló. Se destraba solo cuando venza (hasta 12 horas).',
          true,
        );
      }
      throw new ErrorWsaa(`ARCA rechazó la autenticación: ${fault}`, false);
    }
    if (!res.ok) {
      throw new ErrorWsaa(`ARCA respondió ${res.status} al autenticar.`, true);
    }
    return leerTicketAcceso(cuerpo);
  }

  private leerDeDisco(): TicketAcceso | null {
    try {
      if (!existsSync(this.opciones.rutaCache)) return null;
      const crudo = JSON.parse(readFileSync(this.opciones.rutaCache, 'utf8')) as TicketEnDisco;
      const expiracion = new Date(crudo.expiracion);
      if (Number.isNaN(expiracion.getTime())) return null;
      return { token: crudo.token, sign: crudo.sign, expiracion };
    } catch {
      // Un caché ilegible no puede frenar la facturación: se pide uno nuevo.
      return null;
    }
  }

  private guardarEnDisco(t: TicketAcceso): void {
    try {
      mkdirSync(dirname(this.opciones.rutaCache), { recursive: true });
      const dato: TicketEnDisco = {
        token: t.token,
        sign: t.sign,
        expiracion: t.expiracion.toISOString(),
      };
      writeFileSync(this.opciones.rutaCache, JSON.stringify(dato), { mode: 0o600 });
    } catch {
      // Si no se pudo guardar se sigue igual: el de memoria alcanza hasta el
      // próximo reinicio.
    }
  }
}

/** Ruta del caché del ticket, junto al certificado del comercio. */
export function rutaCacheTicket(raizSecrets: string, cuit: string, entorno: EntornoArca): string {
  return join(raizSecrets, 'arca', cuit, `ticket-${entorno}.json`);
}

function sobreLoginCms(cmsBase64: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"',
    ' xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">',
    '<soapenv:Header/>',
    '<soapenv:Body>',
    '<wsaa:loginCms>',
    `<wsaa:in0>${cmsBase64}</wsaa:in0>`,
    '</wsaa:loginCms>',
    '</soapenv:Body>',
    '</soapenv:Envelope>',
  ].join('');
}
