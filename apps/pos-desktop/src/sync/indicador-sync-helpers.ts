import type { OperacionEnCola } from "@nexosoft/sync";

function soloFecha(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("es-AR");
}

/** El rango de fechas de un conjunto de operaciones, para decir qué se descarta. */
export function rangoDeFechas(ops: readonly OperacionEnCola[]): string | null {
  const fechas = ops.map((o) => o.creadaEn).sort();
  const primera = fechas[0];
  const ultima = fechas[fechas.length - 1];
  if (primera === undefined || ultima === undefined) return null;
  const desde = soloFecha(primera);
  const hasta = soloFecha(ultima);
  return desde === hasta ? `del ${desde}` : `entre el ${desde} y el ${hasta}`;
}

/**
 * Lo que se le pregunta antes de descartar.
 *
 * Tiene que decir tres cosas, porque las tres se malinterpretan solas:
 * cuántas son, que **no se borra ninguna venta**, y por qué descartarlas no es
 * resignarse — es que no pueden entrar nunca, y mientras estén ahí el aviso de
 * arriba queda encendido para siempre y tapa cualquier falla nueva.
 */
export function confirmacionDescartar(ops: readonly OperacionEnCola[]): string {
  const rango = rangoDeFechas(ops);
  const cuantas =
    ops.length === 1 ? "1 operación" : `${ops.length} operaciones`;

  return (
    `Descartar ${cuantas}${rango === null ? "" : ` ${rango}`}.\n\n` +
    "Estas ventas están guardadas en esta terminal y no se borran. Lo que se " +
    "saca es el intento de subirlas al servidor, que no puede prosperar: " +
    "apuntan a datos que en el servidor ya no existen.\n\n" +
    "Sirve para que el aviso de error deje de estar encendido y se vuelvan a " +
    "ver las fallas nuevas.\n\n" +
    "¿Descartarlas?"
  );
}
