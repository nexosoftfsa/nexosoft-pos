import { Injectable, Logger } from '@nestjs/common';
import { codigoComprobanteArcaOpcional } from '@nexosoft/domain';

import { ClienteWsaa, rutaCacheTicket, URL_WSAA } from './arca/wsaa';
import { ClienteWsfev1, URL_WSFEV1 } from './arca/wsfev1';
import { detalleDeRed } from './arca/detalle-de-red';
import { fetchArca } from './arca/fetch-arca';
import { CertificadoService } from './certificado.service';
import { ConfiguracionFiscalService } from './configuracion-fiscal.service';

/** Un paso del diagnóstico, con lo que hay que hacer si falla. */
export interface PasoDiagnostico {
  readonly paso: string;
  readonly ok: boolean;
  readonly detalle: string;
  /** Qué revisar. Sólo cuando falla. */
  readonly queHacer?: string;
}

/**
 * Prueba el circuito con ARCA de punta a punta, sin emitir nada.
 *
 * Existe porque la primera puesta en producción se frenó un día entero: la
 * única forma de probar era hacer una venta, y el error que quedaba guardado
 * decía "No se pudo contactar a ARCA (fetch failed)", que no distingue entre un
 * problema de red, un certificado mal delegado y un punto de venta inexistente.
 *
 * Los tres pasos están en el orden en que fallan, y cada uno descarta al
 * anterior:
 *
 * 1. **Llegar a ARCA** — DNS, firewall, TLS. No usa el certificado.
 * 2. **Autenticar (WSAA)** — el certificado y su delegación al servicio `wsfe`.
 * 3. **Consultar el punto de venta (WSFEv1)** — que el punto de venta exista en
 *    ESE entorno y esté habilitado para Web Services.
 *
 * Es de sólo lectura: no emite ni reserva numeración.
 */
@Injectable()
export class DiagnosticoArcaService {
  private readonly log = new Logger(DiagnosticoArcaService.name);

  constructor(
    private readonly config: ConfiguracionFiscalService,
    private readonly certificados: CertificadoService,
  ) {}

  async correr(): Promise<{ entorno: string | null; pasos: PasoDiagnostico[] }> {
    const fiscal = await this.config.obtener();
    if (fiscal === null) {
      return {
        entorno: null,
        pasos: [
          {
            paso: 'Datos fiscales',
            ok: false,
            detalle: 'No están cargados el CUIT, el punto de venta o la condición frente al IVA.',
            queHacer: 'Completalos en Configuración y guardá.',
          },
        ],
      };
    }

    const material = this.certificados.materialDeFirma(fiscal.cuit);
    const pasos: PasoDiagnostico[] = [];
    const entorno = fiscal.entorno;

    pasos.push(await this.llegarAArca(entorno));
    if (!pasos[0]!.ok) return { entorno, pasos };

    if (material === null) {
      pasos.push({
        paso: 'Certificado',
        ok: false,
        detalle: 'No hay certificado cargado en este servidor.',
        queHacer: 'Cargá el .crt en Configuración > Facturación electrónica.',
      });
      return { entorno, pasos };
    }

    const wsaa = new ClienteWsaa({
      entorno,
      certificadoPem: material.certificadoPem,
      clavePrivadaPem: material.clavePrivadaPem,
      rutaCache: rutaCacheTicket(this.certificados.raizSecrets, fiscal.cuit, entorno),
    });

    let ticket;
    try {
      ticket = await wsaa.obtenerTicket('wsfe');
      pasos.push({
        paso: 'Autenticar con el certificado (WSAA)',
        ok: true,
        detalle: `Ticket de acceso válido hasta ${ticket.expiracion.toLocaleString('es-AR')}.`,
      });
    } catch (e) {
      pasos.push({
        paso: 'Autenticar con el certificado (WSAA)',
        ok: false,
        detalle: (e as Error).message,
        queHacer:
          'Revisá que el certificado cargado sea el de ESTE entorno y que en el Administrador de Relaciones de ARCA el servicio de Facturación Electrónica esté asociado a ese certificado. La delegación de homologación no sirve en producción.',
      });
      return { entorno, pasos };
    }

    const wsfe = new ClienteWsfev1({ entorno, cuit: fiscal.cuit });
    // Se consulta el tipo que este comercio emite: un Monotributo no tiene
    // Factura B, y preguntar por una que no le corresponde da un error que
    // despista.
    const codigo = codigoComprobanteArcaOpcional(fiscal.discriminaIva ? 'FacturaB' : 'FacturaC');
    try {
      const ultimo = await wsfe.ultimoAutorizado(ticket, fiscal.puntoDeVenta, codigo ?? 11);
      pasos.push({
        paso: `Consultar el punto de venta ${fiscal.puntoDeVenta}`,
        ok: true,
        detalle: `ARCA responde. Último comprobante autorizado: ${ultimo}.`,
      });
    } catch (e) {
      pasos.push({
        paso: `Consultar el punto de venta ${fiscal.puntoDeVenta}`,
        ok: false,
        detalle: (e as Error).message,
        queHacer:
          'Revisá que el punto de venta exista en ESTE entorno de ARCA y esté dado de alta para Web Services (no "Comprobantes en línea"). Los puntos de venta de homologación y de producción son distintos.',
      });
    }

    return { entorno, pasos };
  }

  /**
   * ¿Se llega al servidor de ARCA? Sin certificado ni firma: es sólo red.
   *
   * Separarlo importa porque es el único paso que no depende de nada del
   * comercio. Si falla acá, no tiene sentido mirar certificados ni permisos:
   * el problema está entre esta PC e internet.
   */
  private async llegarAArca(entorno: 'homologacion' | 'produccion'): Promise<PasoDiagnostico> {
    const url = URL_WSFEV1[entorno];
    try {
      // Con el MISMO cliente que usa la facturación: si probáramos con `fetch`
      // a secas, el diagnóstico diría que no se llega aunque el sistema sí
      // pueda (o al revés), que es peor que no tener diagnóstico.
      const res = await fetchArca(`${url}?WSDL`, {
        method: 'GET',
        signal: AbortSignal.timeout(15_000),
      });
      return {
        paso: 'Llegar a ARCA',
        ok: true,
        detalle: `${url} responde (HTTP ${res.status}).`,
      };
    } catch (e) {
      const detalle = detalleDeRed(e);
      this.log.warn(`No se llega a ARCA (${entorno}): ${detalle}`);
      return {
        paso: 'Llegar a ARCA',
        ok: false,
        detalle: `No se pudo abrir ${url} — ${detalle}`,
        queHacer: this.pistaDeRed(detalle, url),
      };
    }
  }

  /** Traduce el código de red a lo que conviene revisar. */
  private pistaDeRed(detalle: string, url: string): string {
    const d = detalle.toUpperCase();
    if (d.includes('ENOTFOUND') || d.includes('EAI_AGAIN')) {
      return `El DNS de esta PC no resuelve el nombre del servidor de ARCA. Probá abrir ${url} en el navegador DE ESTA MISMA PC: si tampoco abre, es la red o el DNS.`;
    }
    if (d.includes('ETIMEDOUT') || d.includes('ENETUNREACH') || d.includes('EHOSTUNREACH')) {
      return `No hay salida hacia ARCA: suele ser el firewall o el antivirus bloqueando al servidor. Probá abrir ${url} en el navegador de esta PC.`;
    }
    if (d.includes('ECONNREFUSED') || d.includes('ECONNRESET')) {
      return 'La conexión se abre y se corta. Suele ser un firewall, un proxy o un antivirus que inspecciona HTTPS.';
    }
    if (d.includes('CERT') || d.includes('SELF_SIGNED') || d.includes('UNABLE_TO_VERIFY')) {
      return 'El certificado del servidor de ARCA no se pudo validar. Casi siempre es un antivirus que intercepta HTTPS, o la fecha y hora de la PC mal puestas.';
    }
    return `Probá abrir ${url} en el navegador DE ESTA MISMA PC. Si abre ahí y acá no, avisanos con este detalle.`;
  }
}
