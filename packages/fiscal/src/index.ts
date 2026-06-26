/**
 * @nexosoft/fiscal
 * Integración fiscal ARCA (ex AFIP) AISLADA tras la interfaz `ServicioFiscal`
 * (ADR-0008). El resto del sistema depende del contrato, no de SOAP/WSFEv1.
 */
export * from "./servicio-fiscal.js";
export * from "./solicitud.js";
export * from "./mock-servicio-fiscal.js";
export * from "./arca-servicio-fiscal.js";
