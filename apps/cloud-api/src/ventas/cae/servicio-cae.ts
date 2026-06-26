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

export interface ServicioCae {
  autorizar(solicitud: SolicitudCae): Promise<ResultadoCae>;
}

export const SERVICIO_CAE = Symbol('SERVICIO_CAE');
