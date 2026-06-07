/**
 * @nexosoft/pagos
 * Cobros electrónicos detrás de la interfaz `PasarelaDePago` (ADR-0010).
 *
 * Implementaciones previstas:
 *  - MercadoPagoPasarela: Point (tarjeta presencial) + QR (billetera).
 *  - MockPasarela: aprueba/rechaza/simula demoras para desarrollo y tests.
 *
 * El cobro electrónico es ONLINE: sin conexión, la venta se cierra registrando la
 * forma de pago y el cobro queda pendiente de conciliación. Idempotencia por
 * `intencionPagoId`.
 */
export const PAGOS_PACKAGE = "@nexosoft/pagos";
