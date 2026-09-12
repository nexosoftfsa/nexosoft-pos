/**
 * Freno de emergencia contra una terminal que emite en bucle.
 *
 * El 11/9/2026 un defecto del POS emitió **cientos de comprobantes fiscales en
 * dos minutos** (ADR-0075). El servidor los aceptó todos, y con razón: cada uno
 * traía su propio `operacionId`, así que la idempotencia —que existe y
 * funciona— no tenía nada que deduplicar. Eran ventas distintas para todo
 * efecto.
 *
 * Esto no reemplaza al arreglo del POS. Es la red de abajo: si mañana otro
 * camino se desboca, que no llegue a ARCA.
 *
 * ## Por qué el tope es por ritmo y no por contenido
 *
 * Lo tentador sería detectar ventas idénticas seguidas, pero un kiosco vende
 * diez veces el mismo cigarrillo en un minuto y eso es perfectamente normal.
 * Lo que ninguna caja real hace es **cerrar treinta ventas en un minuto**: hay
 * un cliente adelante, hay que cobrar, dar vuelto y entregar. Treinta por
 * minuto es una cada dos segundos, sostenido, que es justo el ritmo del bucle.
 *
 * ## Por qué no rompe el modo offline
 *
 * Una terminal que estuvo sin servidor sube su cola de golpe, y eso puede ser
 * cincuenta ventas en dos segundos: legítimas todas. Se distinguen por la
 * FECHA DE LA VENTA, no por cuándo llegan — las de la cola ocurrieron hace
 * rato. Sólo cuentan para el tope las ventas cuya fecha es de recién, que son
 * las únicas que un bucle puede producir.
 */

/**
 * Cuántas ventas de esta terminal, ocurridas en el último minuto, se aceptan.
 *
 * Treinta es un número deliberadamente alto: cinco veces el pico realista de
 * una caja rápida. La idea no es ajustar el ritmo del comercio, es que un bucle
 * no llegue a emitir cien comprobantes antes de que alguien lo note.
 */
export const TOPE_VENTAS_POR_MINUTO = 30;

/** La ventana que se mira hacia atrás. */
export const VENTANA_RAFAGA_MS = 60_000;

/**
 * `true` si esta venta ocurrió recién, y por lo tanto cuenta para el tope.
 *
 * Una venta con fecha vieja viene de la cola de una terminal que estuvo
 * offline: nada que ver con un bucle, y frenarla sería perder una venta real.
 */
export function cuentaParaElTope(fechaDeLaVenta: Date, ahora: Date): boolean {
  const antiguedad = ahora.getTime() - fechaDeLaVenta.getTime();
  return antiguedad < VENTANA_RAFAGA_MS;
}

/** `true` si ya se pasó del tope y hay que frenar. */
export function esRafagaAnormal(ventasEnLaVentana: number): boolean {
  return ventasEnLaVentana >= TOPE_VENTAS_POR_MINUTO;
}

/**
 * El mensaje que ve quien está en la caja.
 *
 * Dice qué pasó, qué hacer y que las ventas ya emitidas están bien: lo peor que
 * puede hacer un mensaje así es dejar la duda de si se perdió algo.
 */
export function motivoRafaga(ventasEnLaVentana: number): string {
  return (
    `Esta terminal registró ${ventasEnLaVentana} ventas en el último minuto, que es más de lo que ` +
    'puede pasar en una caja real. Para no emitir comprobantes de más ante ARCA, el servidor frenó ' +
    'las siguientes. Las ventas ya emitidas están bien. Cerrá el POS y volvé a abrirlo, y si vuelve ' +
    'a pasar avisanos antes de seguir vendiendo.'
  );
}
