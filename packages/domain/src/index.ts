/**
 * @nexosoft/domain
 * Tipos y lógica de dominio compartida entre el cliente POS y el cloud-api.
 * Es la ÚNICA fuente de verdad de las reglas de negocio: no se duplica lógica.
 *
 * Contenido previsto (Fase 1+):
 *  - Money: value object de dinero con decimales exactos (ADR-0007).
 *  - Comprobantes: Factura A/B/C, Nota de Crédito/Débito, Remito, Presupuesto.
 *  - Cálculo de IVA, impuestos internos, descuentos, recargos, vuelto y redondeo.
 *  - Esquemas de validación (zod) compartidos cliente/servidor.
 *
 * Ver /docs/arquitectura.md para el modelo de dominio.
 */
export const DOMAIN_PACKAGE = "@nexosoft/domain";
