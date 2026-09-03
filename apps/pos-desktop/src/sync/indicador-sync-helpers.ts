import type { OperacionEnCola } from "@nexosoft/sync";

import type { EsperandoCae } from "./cliente-ventas";

/**
 * Qué muestra la píldora de la barra superior.
 *
 * Hay DOS caminos que pueden fallar por separado, y hasta ahora la píldora sólo
 * hablaba de uno:
 *
 *  1. **Subir la venta al servidor de la sucursal**, que está en la LAN. Es la
 *     cola de sincronización: `pendientes` y `fallidas`.
 *  2. **Conseguir el CAE de ARCA**, que sí necesita internet. Una venta puede
 *     estar perfectamente subida y sin CAE.
 *
 * Mientras el POS confundía "sin internet" con "sin servidor" (ADR-0066), el
 * estado offline tapaba el segundo caso de casualidad. Al arreglar el primero,
 * quedó un hueco: con internet caído y el servidor al lado, la píldora decía
 * "Sincronizado" mientras los comprobantes se apilaban sin CAE.
 *
 * El orden de prioridad es por lo que hay que hacer al respecto: primero lo que
 * pide una acción del cajero, después lo que se resuelve solo.
 */
export type TonoSync = "ok" | "trabajando" | "pendiente" | "sin-cae" | "offline" | "error";

export interface EstadoPildora {
  readonly tono: TonoSync;
  readonly texto: string;
  /** Explicación larga, para el `title`. Nunca vacía. */
  readonly detalle: string;
}

function plural(n: number, singular: string, plural_: string): string {
  return `${n} ${n === 1 ? singular : plural_}`;
}

export function estadoDeLaPildora(estado: {
  readonly online: boolean;
  readonly sincronizando: boolean;
  readonly pendientes: number;
  readonly fallidas: number;
  readonly esperandoCae?: EsperandoCae | null;
}): EstadoPildora {
  const cae = estado.esperandoCae;

  // Lo primero es lo que no se arregla solo: alguien tiene que mirarlo.
  if (estado.fallidas > 0) {
    return {
      tono: "error",
      texto: `${plural(estado.fallidas, "venta", "ventas")} con error`,
      detalle: "Estas ventas no pudieron registrarse en el servidor. Hay que ver el motivo.",
    };
  }
  if (cae !== undefined && cae !== null && cae.vencidas > 0) {
    return {
      tono: "error",
      texto: `${plural(cae.vencidas, "comprobante", "comprobantes")} sin CAE, fuera de plazo`,
      detalle:
        "ARCA ya no los autoriza por fecha. No se arreglan esperando: hay que " +
        "regularizarlos con el contador.",
    };
  }
  if (!estado.online) {
    return {
      tono: "offline",
      texto: "Sin conexión",
      detalle:
        "No se llega al servidor de la sucursal. Se puede seguir vendiendo: las " +
        "ventas quedan guardadas acá y suben solas cuando vuelva.",
    };
  }
  if (estado.sincronizando) {
    return { tono: "trabajando", texto: "Sincronizando…", detalle: "Subiendo ventas al servidor." };
  }
  if (estado.pendientes > 0) {
    return {
      tono: "pendiente",
      texto: `${plural(estado.pendientes, "venta", "ventas")} sin subir`,
      detalle: "Todavía no llegaron al servidor de la sucursal.",
    };
  }
  if (cae !== undefined && cae !== null && cae.cantidad > 0) {
    return {
      tono: "sin-cae",
      texto: `${plural(cae.cantidad, "comprobante", "comprobantes")} sin CAE`,
      detalle:
        "Las ventas están registradas, pero ARCA todavía no las autorizó. El CAE " +
        "se consigue solo cuando vuelva internet; no hay que hacer nada.",
    };
  }
  return {
    tono: "ok",
    texto: "Sincronizado",
    detalle: "Todo subido al servidor y autorizado por ARCA.",
  };
}

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
