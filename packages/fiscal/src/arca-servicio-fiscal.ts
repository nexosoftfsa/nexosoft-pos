/**
 * `ArcaServicioFiscal`: adaptador REAL contra ARCA (WSAA + WSFEv1).
 *
 * ⚠️ Requiere **certificado X.509 + clave privada** y un **CUIT habilitado** en
 * ARCA (homologación o producción). Como acá no hay certificados ni red
 * (ADR-0008), los métodos están **documentados pero no implementados**: lanzan un
 * error claro. El `MockServicioFiscal` cubre todo el flujo mientras tanto.
 *
 * ## Pasos para completar en producción
 * 1. **WSAA** (`obtenerTicketAcceso`): armar el TRA (XML con `uniqueId`,
 *    `generationTime`, `expirationTime`, `service=wsfe`), firmarlo en **CMS/PKCS#7**
 *    con el certificado + clave, invocar `LoginCms`, parsear `token`+`sign` y
 *    **cachearlos** hasta su expiración (~12 h).
 * 2. Mapear `SolicitudCae` → **`FECAESolicitar`** (`FeCabReq` + `FeDetReq` con
 *    `CbteTipo` (ver `codigoComprobanteArca`), `DocTipo`/`DocNro`, importes, array
 *    `Iva` por alícuota y, en NC/ND, `CbtesAsoc`).
 * 3. Invocar `WSFEv1.FECAESolicitar` con `Auth{token, sign, cuit}`.
 * 4. Parsear el resultado → `CAE` + `CAEFchVto` (autorizada) o `Errors`/`Observations`.
 *
 * Recomendado: un cliente SOAP liviano + firma CMS (p. ej. `node-forge`). Los
 * certificados van fuera del repo (`/secrets`, ignorada) y cifrados en reposo.
 */
import { ErrorFiscal, letraDe } from "@nexosoft/domain";
import type { TipoComprobante } from "@nexosoft/domain";

import type { ResultadoCae, ServicioFiscal, SolicitudCae } from "./servicio-fiscal.js";

export type EntornoArca = "homologacion" | "produccion";

export interface ConfiguracionArca {
  readonly cuit: string;
  readonly entorno: EntornoArca;
  /** Ruta al certificado X.509 (fuera del repo). */
  readonly certificadoPath: string;
  /** Ruta a la clave privada (fuera del repo). */
  readonly clavePrivadaPath: string;
  /** Endpoints; por defecto según el entorno. */
  readonly urlWsaa?: string;
  readonly urlWsfev1?: string;
}

export const ENDPOINTS_ARCA: Record<
  EntornoArca,
  { readonly wsaa: string; readonly wsfev1: string }
> = {
  homologacion: {
    wsaa: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
    wsfev1: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx",
  },
  produccion: {
    wsaa: "https://wsaa.afip.gov.ar/ws/services/LoginCms",
    wsfev1: "https://servicios1.afip.gov.ar/wsfev1/service.asmx",
  },
};

/**
 * Código de tipo de comprobante en WSFEv1 (`CbteTipo`).
 * Factura A=1 · B=6 · C=11; Nota de Débito A=2 · B=7 · C=12;
 * Nota de Crédito A=3 · B=8 · C=13.
 */
// Se mudó a @nexosoft/domain: lo necesitan el POS y el SERVIDOR en tiempo de
// ejecución, y este paquete todavía se publica como TypeScript sin compilar
// —que Node no puede cargar desde node_modules—. Se re-exporta para no romper
// a quien ya lo importaba desde acá.
export { codigoComprobanteArca } from "@nexosoft/domain";

const NO_IMPLEMENTADO =
  "Adaptador ARCA real no implementado: requiere certificado X.509, CUIT habilitado y completar WSAA/WSFEv1. Ver README de @nexosoft/fiscal. Mientras tanto, usar MockServicioFiscal.";

export class ArcaServicioFiscal implements ServicioFiscal {
  constructor(private readonly config: ConfiguracionArca) {}

  /** Endpoints efectivos (config explícita o por entorno). */
  get endpoints(): { wsaa: string; wsfev1: string } {
    const base = ENDPOINTS_ARCA[this.config.entorno];
    return {
      wsaa: this.config.urlWsaa ?? base.wsaa,
      wsfev1: this.config.urlWsfev1 ?? base.wsfev1,
    };
  }

  async solicitarCae(_solicitud: SolicitudCae): Promise<ResultadoCae> {
    // Ver pasos 1-4 en el encabezado del archivo.
    throw new ErrorFiscal("ARCA_NO_IMPLEMENTADO", NO_IMPLEMENTADO);
  }

  async ultimoNumeroAutorizado(_puntoDeVenta: number, _tipo: TipoComprobante): Promise<number> {
    // WSFEv1.FECompUltimoAutorizado(PtoVta, CbteTipo) → CbteNro.
    throw new ErrorFiscal("ARCA_NO_IMPLEMENTADO", NO_IMPLEMENTADO);
  }
}
