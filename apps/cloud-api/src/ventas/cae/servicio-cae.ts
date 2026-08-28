/**
 * Puerto del servicio de autorización fiscal (CAE).
 *
 * El CAE real lo otorga ARCA vía `@nexosoft/fiscal` (WSAA + WSFEv1, ADR-0008).
 * Acá vive sólo la interfaz; el mock permite registrar ventas sin ARCA y el
 * adaptador real se enchufa sin tocar el módulo de ventas.
 */

/** Un renglón del detalle de IVA que pide ARCA. */
export interface RenglonIvaSolicitud {
  readonly codigoArca: number;
  readonly base: string;
  readonly importe: string;
}

/**
 * El comprobante que corrige una Nota de Crédito o de Débito (`CbtesAsoc`).
 *
 * ARCA lo exige: una NC no existe sola, anula o corrige una factura concreta.
 */
export interface ComprobanteAsociadoSolicitud {
  readonly codigoComprobante: number;
  readonly numero: number;
  /**
   * Punto de venta del comprobante original. Si no viene, se usa el del
   * comercio: la venta no lo guarda, y una NC anula una factura propia emitida
   * por el mismo punto de venta.
   */
  readonly puntoDeVenta?: number;
  readonly fecha?: Date;
}

export interface SolicitudCae {
  tipoComprobante: string;
  total: string;
  sucursalId: string;
  /**
   * Lo que sigue lo necesita ARCA de verdad; el mock lo ignora. Es opcional
   * para no romper a quien ya llamaba con lo mínimo (por ejemplo el reintento
   * de las pendientes, que reconstruye lo que puede).
   */
  /** CbteTipo de ARCA. Si no viene, el adaptador real no puede emitir. */
  codigoComprobante?: number;
  fecha?: Date;
  /** `ImpNeto`. En un comprobante C es el total. */
  neto?: string;
  iva?: string;
  exento?: string;
  renglonesIva?: readonly RenglonIvaSolicitud[];
  /** 80=CUIT, 96=DNI, 99=consumidor final. */
  tipoDocReceptor?: number;
  nroDocReceptor?: string;
  /**
   * Condición del comprador frente al IVA, en el código de ARCA
   * (1=Responsable Inscripto, 4=Exento, 5=Consumidor Final, 6=Monotributo).
   * Obligatoria en el comprobante desde la RG 5616/2024.
   */
  condicionIvaReceptor?: number;
  /**
   * Qué comprobante corrige, para Notas de Crédito y de Débito. Sin esto ARCA
   * las rechaza.
   */
  comprobantesAsociados?: readonly ComprobanteAsociadoSolicitud[];
}

export interface ResultadoCae {
  cae: string;
  caeFechaVto: Date;
  numeroComprobante: number;
  tipoComprobante: string;
}

/**
 * ARCA no está disponible: no contestó, no hay internet, el servicio está
 * caído o el ticket de acceso no se pudo obtener.
 *
 * La distinción con `ErrorCaeRechazado` es la que decide todo lo demás: acá la
 * venta se registra igual y el CAE se pide después (AFIP se cae seguido y un
 * comercio no puede dejar de vender por eso, ADR-0004). Un rechazo, en cambio,
 * no se arregla reintentando.
 */
export class ErrorCaeNoDisponible extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErrorCaeNoDisponible';
  }
}

/** ARCA contestó y rechazó el comprobante. Reintentar no sirve: hay que corregirlo. */
export class ErrorCaeRechazado extends Error {
  constructor(
    message: string,
    /** Código de ARCA, para poder buscarlo en su documentación. */
    readonly codigo?: string,
  ) {
    super(message);
    this.name = 'ErrorCaeRechazado';
  }
}

export interface ServicioCae {
  autorizar(solicitud: SolicitudCae): Promise<ResultadoCae>;
}

export const SERVICIO_CAE = Symbol('SERVICIO_CAE');
