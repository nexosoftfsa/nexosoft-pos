/**
 * @nexosoft/fiscal
 * Integración fiscal ARCA (ex AFIP) AISLADA del resto del sistema (ADR-0008).
 *
 * Expone una interfaz `ServicioFiscal` (puerto) con dos implementaciones:
 *  - ArcaServicioFiscal: WSAA (firma del TA con cert X.509) + WSFEv1 (CAE).
 *  - MockServicioFiscal: simula CAE/errores para desarrollo y tests sin red.
 *
 * Contenido previsto (Fase 2):
 *  - WSAA: login, cacheo y renovación del Ticket de Acceso (TA).
 *  - WSFEv1: solicitud de CAE para Facturas A/B/C, NC/ND.
 *  - Reintentos idempotentes y manejo de estados (pendiente/autorizada/rechazada).
 *
 * Ver ADR-0008 y /docs/arquitectura.md (flujo de CAE diferido).
 */
export const FISCAL_PACKAGE = "@nexosoft/fiscal";
