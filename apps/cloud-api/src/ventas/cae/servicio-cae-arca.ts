import { Injectable, Logger } from '@nestjs/common';

import { CertificadoService } from '../../fiscal/certificado.service';
import { ClienteWsaa, ErrorWsaa, rutaCacheTicket, type EntornoArca } from '../../fiscal/arca/wsaa';
import {
  ClienteWsfev1,
  ErrorWsfe,
  ErrorWsfeNoSoportado,
  type DatosComprobante,
} from '../../fiscal/arca/wsfev1';
import { ConfiguracionFiscalService } from '../../fiscal/configuracion-fiscal.service';
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
 */
@Injectable()
export class ServicioCaeArca implements ServicioCae {
  private readonly log = new Logger(ServicioCaeArca.name);

  constructor(
    private readonly config: ConfiguracionFiscalService,
    private readonly certificados: CertificadoService,
  ) {}

  async autorizar(solicitud: SolicitudCae): Promise<ResultadoCae> {
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
    const wsaa = new ClienteWsaa({
      entorno,
      certificadoPem: material.certificadoPem,
      clavePrivadaPem: material.clavePrivadaPem,
      rutaCache: rutaCacheTicket(this.certificados.raizSecrets, fiscal.cuit, entorno),
    });
    const wsfe = new ClienteWsfev1({ entorno, cuit: fiscal.cuit });

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
      };

      const r = await wsfe.solicitarCae(ticket, datos);
      if (r.observaciones.length > 0) {
        this.log.warn(`ARCA autorizó con observaciones: ${r.observaciones.join(' | ')}`);
      }
      return {
        cae: r.cae,
        caeFechaVto: r.caeFechaVto,
        numeroComprobante: r.numero === 0 ? datos.numero : r.numero,
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
