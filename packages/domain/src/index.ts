/**
 * @nexosoft/domain
 * Tipos y lógica de dominio compartida entre el cliente POS y el cloud-api.
 * Es la ÚNICA fuente de verdad de las reglas de negocio: no se duplica lógica.
 *
 * Ver /docs/arquitectura.md para el modelo de dominio.
 */
export const DOMAIN_PACKAGE = "@nexosoft/domain";

// Errores de dominio
export * from "./comun/errores.js";

// Dinero (ADR-0007)
export * from "./dinero/money.js";

// Fiscal: condición de IVA, alícuotas y comprobantes (ADR-0012 / ADR-0013)
export * from "./fiscal/condicion-iva.js";
export * from "./fiscal/alicuota-iva.js";
export * from "./fiscal/tipo-comprobante.js";

// Ventas: cálculo de comprobante y cobro (pago combinado, vuelto)
export * from "./ventas/calculo-comprobante.js";
export * from "./ventas/pago.js";

// Esquemas de validación (zod) para los bordes
export * from "./esquemas/esquemas.js";
