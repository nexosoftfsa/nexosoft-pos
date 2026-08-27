/**
 * Puerto del servicio de autorización fiscal (CAE).
 *
 * El CAE real lo otorga ARCA vía `@nexosoft/fiscal` (WSAA + WSFEv1, ADR-0008).
 * Acá vive sólo la interfaz; el mock permite registrar ventas sin ARCA y el
 * adaptador real se enchufa sin tocar el módulo de ventas.
 */

export interface SolicitudCae {
  tipoComprobante: string;
  total: string;
  sucursalId: string;
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
