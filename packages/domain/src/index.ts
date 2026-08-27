/**
 * @nexosoft/domain
 * Tipos y lÃ³gica de dominio compartida entre el cliente POS y el cloud-api.
 * Es la ÃšNICA fuente de verdad de las reglas de negocio: no se duplica lÃ³gica.
 *
 * Ver /docs/arquitectura.md para el modelo de dominio.
 */
export const DOMAIN_PACKAGE = "@nexosoft/domain";

// Errores de dominio y utilidades comunes
export * from "./comun/errores.js";
export * from "./comun/id.js";
export * from "./comun/cantidad.js";

// Dinero (ADR-0007)
export * from "./dinero/money.js";

// Fiscal: condiciÃ³n de IVA, alÃ­cuotas y comprobantes (ADR-0012 / ADR-0013)
export * from "./fiscal/condicion-iva.js";
export * from "./fiscal/alicuota-iva.js";
export * from "./fiscal/tipo-comprobante.js";
export * from "./fiscal/cuit.js";
export * from "./fiscal/qr-arca.js";

// CatÃ¡logo: artÃ­culos, listas de precios, costeo/marcaciÃ³n y promos (ADR-0014)
export * from "./catalogo/unidad-de-medida.js";
export * from "./catalogo/articulo.js";
export * from "./catalogo/lista-de-precios.js";
export * from "./catalogo/precios.js";
export * from "./catalogo/promocion.js";

// Stock: depÃ³sitos, existencias, movimientos, lotes/vencimientos y alertas (ADR-0015)
export * from "./stock/deposito.js";
export * from "./stock/existencia.js";
export * from "./stock/movimiento-stock.js";
export * from "./stock/lote.js";
export * from "./stock/alerta-stock.js";

// Ventas: cÃ¡lculo de comprobante y cobro (pago combinado, vuelto)
export * from "./ventas/calculo-comprobante.js";
export * from "./ventas/pago.js";

// Esquemas de validaciÃ³n (zod) para los bordes
export * from "./esquemas/esquemas.js";
