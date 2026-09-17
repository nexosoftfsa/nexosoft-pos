/**
 * Cuándo se puede arrancar una venta nueva, y cuándo se puede abrir el
 * asistente de cobro.
 *
 * Vive acá, afuera del componente, porque es la regla que más veces se nos
 * escapó: cuatro incidentes de campo, todos con la misma forma — un Enter de
 * más que llega mientras la venta anterior todavía está terminando.
 *
 *  - 9/9/2026  (ADR-0074): dos comprobantes fiscales, con dos CAE, por una sola
 *    venta. Cada Enter durante la espera de ARCA arrancaba una venta nueva.
 *  - 11/9/2026 (ADR-0075): cientos de comprobantes en dos minutos. El polling
 *    del cobro QR apagaba "el intervalo vigente" en vez del suyo.
 *  - 16/9/2026: el asistente reabriéndose en "$ 0,00 — Cobro completo".
 *  - 17/9/2026: dos Facturas B con CAE por un solo cobro con QR. Al aprobarse
 *    el pago el polling se apaga, y recién después arranca la registración, que
 *    tarda hasta 8 segundos. En ese hueco no había polling vigente Y nadie
 *    miraba si había una venta en curso: pasaban los dos controles.
 *
 * Cada vez se tapó el agujero puntual. Lo que faltaba era decir la regla
 * entera, en un solo lugar, donde se pueda leer y probar.
 */

/** Lo que hay que saber de la caja para decidir. Todo se lee de refs, no de estado. */
export interface EstadoDeLaCaja {
  /** No hay nada cargado: no hay venta posible. */
  readonly carritoVacio: boolean;
  /** Hay un cobro electrónico esperando al dispositivo (su intervalo está vivo). */
  readonly hayCobroElectronicoVigente: boolean;
  /**
   * Hay una venta recorriendo el ciclo: desde que arranca el cobro hasta que
   * quedó registrada y la pantalla se limpió.
   *
   * Es el que cubre el hueco: `hayCobroElectronicoVigente` se apaga apenas el
   * pago se aprueba, pero la venta recién empieza ahí.
   */
  readonly ventaEnCurso: boolean;
}

/**
 * Si se puede arrancar una venta nueva.
 *
 * Los tres controles son necesarios y ninguno alcanza solo. La prueba está
 * abajo, caso por caso.
 */
export function puedeArrancarVenta(caja: EstadoDeLaCaja): boolean {
  if (caja.carritoVacio) return false;
  if (caja.hayCobroElectronicoVigente) return false;
  if (caja.ventaEnCurso) return false;
  return true;
}

/**
 * Si se puede abrir el asistente de cobro.
 *
 * Además de lo anterior: no se abre uno si ya hay otro abierto, y no se abre
 * sobre una venta que no se va a poder emitir — el motivo ya está a la vista en
 * la cabecera y el asistente lo tapa.
 */
export function puedeAbrirAsistente(
  caja: EstadoDeLaCaja & {
    readonly yaAbierto: boolean;
    /** Qué le falta a la venta para poder emitirse, o `null`. */
    readonly faltaParaFacturar: string | null;
  },
): boolean {
  if (caja.yaAbierto) return false;
  if (caja.faltaParaFacturar !== null) return false;
  return puedeArrancarVenta(caja);
}
