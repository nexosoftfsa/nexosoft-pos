/**
 * Con qué fecha se registra una venta.
 *
 * El POS es offline-first: una venta puede ocurrir a las 14:00 sin internet y
 * llegar al servidor a las 18:00, o al día siguiente. Hasta ahora `creadaEn`
 * era `@default(now())`, o sea **la hora en que la venta llegaba**, no la hora
 * en que ocurrió. Eso rompía tres cosas a la vez:
 *
 *  - **Caja.** El saldo teórico del turno suma las ventas EFECTIVO cuyo
 *    `creadaEn` cae dentro de la ventana del turno (ADR-0026). Una venta que
 *    entraba tarde caía en el turno equivocado, y si el turno ya estaba cerrado
 *    no entraba en ningún arqueo: el cajero cerraba con una diferencia que no
 *    podía explicar.
 *  - **Reportes.** Una venta de las 23:50 que sincronizaba a las 00:10 se
 *    mudaba al día siguiente.
 *  - **ARCA.** El `CbteFch` salía con la fecha de la sincronización, así que no
 *    coincidía con la fecha impresa en el ticket que tiene el cliente. Y
 *    `ventana-de-fecha.ts`, que existe justamente para detectar ventas
 *    demasiado viejas para autorizar, nunca podía dispararse: para él toda
 *    venta era de hoy.
 *
 * Por eso la fecha ahora viaja en el payload. Pero es un dato que manda el
 * cliente, y un reloj de PC de comercio puede estar cualquier cosa: se acepta
 * sólo dentro de límites razonables, y ante la duda se usa la hora del
 * servidor, que es la que teníamos antes.
 */

/**
 * Cuánto se tolera que el reloj de la terminal esté ADELANTADO. Un desfase de
 * minutos es normal; una fecha del futuro lejano es un reloj mal puesto, y
 * aceptarla escondería la venta al final de todos los listados para siempre.
 */
export const TOLERANCIA_ADELANTO_MS = 10 * 60 * 1000;

/**
 * Cuánto se tolera hacia atrás. Un mes cubre de sobra cualquier corte de
 * internet real; más viejo que eso es un reloj sin batería (típicamente vuelve
 * a 2000 o a la fecha de fábrica) y no una venta de verdad.
 */
export const TOLERANCIA_ATRASO_MS = 31 * 24 * 60 * 60 * 1000;

/**
 * Resuelve la fecha con la que se registra la venta.
 *
 * @param iso Lo que mandó el POS (ISO 8601). Puede faltar: las versiones
 *   viejas del POS no lo mandan, y una venta vieja no puede quedar trabada por
 *   eso.
 * @param ahora Hora del servidor.
 */
export function fechaDeVenta(iso: string | undefined, ahora: Date): Date {
  if (iso === undefined || iso === '') return ahora;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return ahora;
  const desfase = fecha.getTime() - ahora.getTime();
  if (desfase > TOLERANCIA_ADELANTO_MS) return ahora;
  if (-desfase > TOLERANCIA_ATRASO_MS) return ahora;
  return fecha;
}
