/**
 * Dónde vive la integración real con ARCA.
 *
 * Este archivo tuvo un `ArcaServicioFiscal` que documentaba los pasos de
 * WSAA/WSFEv1 y lanzaba `ARCA_NO_IMPLEMENTADO`. Quedó obsoleto: la emisión real
 * se implementó (ADR-0058) **en el servidor**, no acá, y nadie usaba esa clase
 * salvo su propio test. Dejarla era peor que no tenerla — decía que la
 * facturación electrónica no estaba hecha cuando sí lo está.
 *
 * La implementación real está en `apps/cloud-api/src/fiscal/arca/`:
 *
 * | Archivo      | Qué hace                                                    |
 * | ------------ | ----------------------------------------------------------- |
 * | `wsaa.ts`    | Ticket de acceso: firma el TRA en CMS y lo cachea en disco.  |
 * | `wsfev1.ts`  | `FECAESolicitar`, `FECompUltimoAutorizado`, `FECompConsultar`. |
 * | `tra.ts`     | Arma y lee el Ticket de Requerimiento de Acceso.             |
 * | `firma-cms.ts` | La firma PKCS#7 que WSAA valida.                           |
 *
 * Está en el servidor y no en este paquete porque necesita el certificado del
 * comercio, que vive fuera del repo y **nunca sale de esa máquina**: cada
 * comercio factura con su propio certificado (ADR-0058).
 *
 * Este paquete sigue siendo el dueño del **contrato** (`ServicioFiscal`) y del
 * `MockServicioFiscal`, que es con lo que se desarrolla y se testea sin red.
 */

// Se mudó a @nexosoft/domain: lo necesitan el POS y el SERVIDOR en tiempo de
// ejecución, y este paquete todavía se publica como TypeScript sin compilar
// —que Node no puede cargar desde node_modules—. Se re-exporta para no romper
// a quien ya lo importaba desde acá.
export { codigoComprobanteArca } from "@nexosoft/domain";

export type EntornoArca = "homologacion" | "produccion";
