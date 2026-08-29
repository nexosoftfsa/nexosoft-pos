import { Injectable, Logger } from '@nestjs/common';

import { CertificadoService } from '../../fiscal/certificado.service';
import { ClienteWsaa, ErrorWsaa, rutaCacheTicket, type EntornoArca } from '../../fiscal/arca/wsaa';
import {
  ClienteWsfev1,
  ErrorWsfe,
  ErrorWsfeNoSoportado,
  type DatosComprobante,
  type ResultadoAutorizacion,
} from '../../fiscal/arca/wsfev1';
import { ConfiguracionFiscalService } from '../../fiscal/configuracion-fiscal.service';
import { ColaPorClave } from './cola-por-clave';
import { solicitarConRecuperacion } from './solicitar-con-recuperacion';
import {
  ErrorCaeNoDisponible,
  ErrorCaeRechazado,
  type ResultadoCae,
  type ServicioCae,
  type SolicitudCae,
} from './servicio-cae';

/**
 * Autorización fiscal REAL contra ARCA (WSAA + WSFEv1).
 *
 * Reemplaza a `ServicioCaeMock` cuando el comercio tiene todo configurado:
 * datos fiscales cargados y certificado de ARCA. Si falta algo, el módulo de
 * ventas sigue con el mock — así un comercio que todavía no está de alta
 * puede vender con ticket interno.
 *
 * Traduce los errores de ARCA a los dos que le importan a la venta:
 *
 *  - `ErrorCaeNoDisponible` -> la venta se registra y el CAE se pide después.
 *  - `ErrorCaeRechazado`    -> el comprobante está mal; reintentar no sirve.
 *
 * Esa traducción es lo que decide si el comercio puede seguir vendiendo
 * cuando AFIP se cae.
 *
 * Dos cuidados que no se ven en el camino feliz:
 *
 * 1. **La numeración se pide en fila** (`ColaPorClave`). Preguntar el último
 *    número y mandar el siguiente son dos llamadas, y dos cajas vendiendo al
 *    mismo tiempo proponían el mismo número.
 * 2. **Si la respuesta se pierde, se pregunta antes de reintentar.** Un timeout
 *    no significa que ARCA no haya autorizado: puede haber emitido y haberse
 *    cortado la vuelta.
 */
@Injectable()
export class ServicioCaeArca implements ServicioCae {
  private readonly log = new Logger(ServicioCaeArca.name);
  /** Una fila por punto de venta y tipo: es el alcance en el que ARCA exige correlatividad. */
  private readonly numeracion = new ColaPorClave();

  constructor(
    private readonly config: ConfiguracionFiscalService,
    private readonly certificados: CertificadoService,
  ) {}

  /**
   * Arma los clientes de ARCA con el certificado y los datos del comercio.
   *
   * Falla con `ErrorCaeNoDisponible` si el comercio todavía no está de alta: es
   * transitorio en el sentido de que se resuelve cargando los datos, no
   * reintentando la llamada.
   */
  private async clientes(): Promise<{
    fiscal: NonNullable<Awaited<ReturnType<ConfiguracionFiscalService['obtener']>>>;
    wsaa: ClienteWsaa;
    wsfe: ClienteWsfev1;
  }> {
    const fiscal = await this.config.obtener();
    if (fiscal === null) {
      throw new ErrorCaeNoDisponible(
        'Faltan los datos fiscales del comercio (CUIT, punto de venta o condición frente al IVA). Completalos en Configuración.',
      );
    }

    const material = this.certificados.materialDeFirma(fiscal.cuit);
    if (material === null) {
      throw new ErrorCaeNoDisponible(
        'No hay certificado de ARCA cargado en este servidor. Cargalo en Configuración > Facturación electrónica.',
      );
    }

    const entorno: EntornoArca = fiscal.entorno;
    return {
      fiscal,
      wsaa: new ClienteWsaa({
        entorno,
        certificadoPem: material.certificadoPem,
        clavePrivadaPem: material.clavePrivadaPem,
        rutaCache: rutaCacheTicket(this.certificados.raizSecrets, fiscal.cuit, entorno),
      }),
      wsfe: new ClienteWsfev1({ entorno, cuit: fiscal.cuit }),
    };
  }

  /**
   * Le pregunta a ARCA qué tiene registrado para un comprobante ya emitido.
   *
   * No emite nada: es de sólo lectura. Sirve para confirmar contra la fuente
   * —sobre todo en homologación, donde el comprobante no aparece en ninguna
   * página pública de ARCA y no hay otra forma de verificarlo.
   *
   * Devuelve `null` si ARCA no lo tiene, que es una respuesta legítima y es
   * justamente lo que se quiere saber.
   */
  async consultar(
    codigoComprobante: number,
    numero: number,
  ): Promise<{ resultado: ResultadoAutorizacion | null; entorno: EntornoArca; puntoDeVenta: number }> {
    const { fiscal, wsaa, wsfe } = await this.clientes();
    try {
      const ticket = await wsaa.obtenerTicket('wsfe');
      const resultado = await wsfe.consultarComprobante(
        ticket,
        fiscal.puntoDeVenta,
        codigoComprobante,
        numero,
      );
      return { resultado, entorno: fiscal.entorno, puntoDeVenta: fiscal.puntoDeVenta };
    } catch (e) {
      throw this.traducir(e);
    }
  }

  async autorizar(solicitud: SolicitudCae): Promise<ResultadoCae> {
    const { fiscal, wsaa, wsfe } = await this.clientes();
    const entorno: EntornoArca = fiscal.entorno;

    // Sin código de ARCA no hay comprobante que emitir: es un ticket interno o
    // un tipo que no existe en WSFEv1. No se arregla reintentando.
    const codigoComprobante = solicitud.codigoComprobante;
    if (codigoComprobante === undefined) {
      throw new ErrorCaeRechazado(
        `El comprobante "${solicitud.tipoComprobante}" no tiene equivalente en ARCA.`,
      );
    }

    try {
      const ticket = await wsaa.obtenerTicket('wsfe');

      // Desde acá hasta que ARCA conteste, nadie más puede estar pidiendo un
      // número para este mismo punto de venta y tipo de comprobante.
      const clave = `${entorno}:${fiscal.cuit}:${fiscal.puntoDeVenta}:${codigoComprobante}`;
      const { autorizacion: r, numeroPropuesto } = await this.numeracion.enFila(clave, async () => {
        // El número lo propone el sistema, pero tiene que seguir al último que
        // ARCA autorizó: es la fuente de verdad de la numeración y valida que
        // sea correlativa.
        const ultimo = await wsfe.ultimoAutorizado(
          ticket,
          fiscal.puntoDeVenta,
          codigoComprobante,
        );

        const datos: DatosComprobante = {
          puntoDeVenta: fiscal.puntoDeVenta,
          codigoComprobante,
          numero: ultimo + 1,
          total: solicitud.total,
          fecha: solicitud.fecha ?? new Date(),
          neto: solicitud.neto ?? solicitud.total,
          iva: solicitud.iva ?? '0.00',
          exento: solicitud.exento ?? '0.00',
          renglonesIva: solicitud.renglonesIva ?? [],
          ...(solicitud.tipoDocReceptor !== undefined
            ? { tipoDocReceptor: solicitud.tipoDocReceptor }
            : {}),
          ...(solicitud.nroDocReceptor !== undefined
            ? { nroDocReceptor: solicitud.nroDocReceptor }
            : {}),
          ...(solicitud.condicionIvaReceptor !== undefined
            ? { condicionIvaReceptor: solicitud.condicionIvaReceptor }
            : {}),
          // El comprobante que corrige una Nota de Crédito. El CUIT es el del
          // propio comercio: la NC anula una factura que emitió él mismo.
          ...(solicitud.comprobantesAsociados !== undefined &&
          solicitud.comprobantesAsociados.length > 0
            ? {
                comprobantesAsociados: solicitud.comprobantesAsociados.map((a) => ({
                  codigoComprobante: a.codigoComprobante,
                  puntoDeVenta: a.puntoDeVenta ?? fiscal.puntoDeVenta,
                  numero: a.numero,
                  cuit: fiscal.cuit,
                  ...(a.fecha !== undefined ? { fecha: a.fecha } : {}),
                })),
              }
            : {}),
        };

        return {
          autorizacion: await solicitarConRecuperacion(wsfe, ticket, datos, (m) =>
            this.log.warn(m),
          ),
          // Por si ARCA no devuelve el número en la respuesta: el que propusimos
          // es el que autorizó.
          numeroPropuesto: datos.numero,
        };
      });

      if (r.observaciones.length > 0) {
        this.log.warn(`ARCA autorizó con observaciones: ${r.observaciones.join(' | ')}`);
      }
      return {
        cae: r.cae,
        caeFechaVto: r.caeFechaVto,
        numeroComprobante: r.numero === 0 ? numeroPropuesto : r.numero,
        tipoComprobante: solicitud.tipoComprobante,
      };
    } catch (e) {
      throw this.traducir(e);
    }
  }

  /** Convierte un error de ARCA en la decisión de reintentar o no. */
  private traducir(e: unknown): Error {
    if (e instanceof ErrorWsfeNoSoportado) {
      // Falta un dato del comprobante: no se arregla reintentando.
      return new ErrorCaeRechazado(e.message);
    }
    if (e instanceof ErrorWsaa) {
      return e.transitorio
        ? new ErrorCaeNoDisponible(e.message)
        : new ErrorCaeRechazado(e.message);
    }
    if (e instanceof ErrorWsfe) {
      return e.transitorio
        ? new ErrorCaeNoDisponible(e.message)
        : new ErrorCaeRechazado(e.message, e.codigo);
    }
    // Algo inesperado: se trata como transitorio para no marcar como
    // rechazado un comprobante que quizás está bien.
    return new ErrorCaeNoDisponible(
      `Error inesperado al pedir el CAE: ${(e as Error).message ?? String(e)}`,
    );
  }
}
