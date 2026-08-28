/**
 * La ventana de fechas que ARCA acepta en `CbteFch`.
 *
 * Con `Concepto = 1` (venta de productos, que es todo lo que emite un POS de
 * mostrador), ARCA rechaza un comprobante cuya fecha esté a más de 5 días de la
 * fecha en que se lo manda.
 *
 * Esto choca de frente con el reintento de pendientes: una venta que quedó sin
 * CAE conserva la fecha del ticket que se le dio al cliente, así que si ARCA
 * estuvo caída —o el comercio sin internet— más de 5 días, esas ventas ya no se
 * pueden autorizar con su fecha real. No es un problema que se arregle
 * reintentando: hay que verlo venir.
 *
 * Por eso el reintento avisa cuando una pendiente se está acercando al límite,
 * y la marca cuando ya lo pasó, en vez de mandarla y comerse el rechazo.
 */

/** Días hacia atrás o adelante que ARCA tolera en `CbteFch`. */
export const DIAS_VENTANA_ARCA = 5;

/** A cuántos días del límite se empieza a avisar. */
export const DIAS_PARA_AVISAR = 2;

/** El día calendario de una fecha, en el huso local. */
function aDiaCalendario(f: Date): number {
  return Math.floor(Date.UTC(f.getFullYear(), f.getMonth(), f.getDate()) / 86_400_000);
}

/** Cuántos días calendario pasaron entre `fecha` y `ahora`. */
export function diasDeAntiguedad(fecha: Date, ahora: Date): number {
  return aDiaCalendario(ahora) - aDiaCalendario(fecha);
}

/** ARCA ya no acepta esta fecha: mandarla es un rechazo seguro. */
export function fueraDeVentanaArca(fecha: Date, ahora: Date): boolean {
  return Math.abs(diasDeAntiguedad(fecha, ahora)) > DIAS_VENTANA_ARCA;
}

/** Todavía entra, pero le quedan pocos días. */
export function porVencerLaVentanaArca(fecha: Date, ahora: Date): boolean {
  const dias = diasDeAntiguedad(fecha, ahora);
  return !fueraDeVentanaArca(fecha, ahora) && dias >= DIAS_VENTANA_ARCA - DIAS_PARA_AVISAR;
}

/** Lo que se guarda en `motivoFiscal` cuando ya no hay nada que reintentar. */
export function motivoVentanaVencida(fecha: Date, ahora: Date): string {
  const dias = diasDeAntiguedad(fecha, ahora);
  return (
    `La venta es del ${fecha.toLocaleDateString('es-AR')} (hace ${dias} días) y ARCA sólo autoriza ` +
    `comprobantes con fecha de hasta ${DIAS_VENTANA_ARCA} días. Ya no se puede autorizar automáticamente: ` +
    'hay que regularizarla con el contador.'
  );
}
