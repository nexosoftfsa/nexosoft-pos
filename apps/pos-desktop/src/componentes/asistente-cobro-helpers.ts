/**
 * Lógica pura del asistente de cobro por teclado (Fase 16: wizard
 * "Seleccionar Medio" → flechas + Enter, inspirado en el simulador de
 * Gemini). Extraída para poder testear las transiciones de paso y los
 * cálculos de monto sin montar `PantallaPos`.
 */
import { FormaDePago, Money } from "@nexosoft/domain";

/**
 * Pasos del asistente. Tras `monto`, si el pago fue parcial se vuelve a
 * `medio` (pago mixto); si cubrió el total se pasa a `resumen` (muestra el
 * vuelto y finaliza la venta) y de ahí a `imprimir` (¿ticket sí o no?).
 */
export type PasoAsistente =
  | "cerrado"
  | "medio"
  | "tarjeta"
  | "cuotas"
  | "cliente"
  | "monto"
  | "resumen"
  | "imprimir";

/** Índice circular: usado por los 4 pasos con lista (medio/tarjeta/cuotas/cliente). */
export function moverCursor(cursor: number, delta: number, longitud: number): number {
  if (longitud <= 0) return 0;
  return (cursor + delta + longitud) % longitud;
}

/** Qué hacer al cerrar la venta, en el último paso del asistente. */
export type AccionImpresion = "ticket" | "a4" | "ninguna";

/**
 * Las opciones del paso "¿imprimir?", en orden. El cursor indexa acá.
 *
 * La lista vive en un solo lugar porque la pinta el asistente y la interpreta
 * la pantalla de venta: cuando estaban duplicadas, agregar una opción quería
 * decir tocar dos archivos y acordarse de los dos.
 *
 * El A4 se agregó el 10/9/2026. Antes el botón de A4 sólo existía en el panel
 * de post-venta, al que este camino no llega: cerrando la venta por el
 * asistente —o sea, siempre— **no había forma de sacar el A4 ORIGINAL**. El
 * único A4 posible era una reimpresión, que sale marcada DUPLICADO.
 */
export const OPCIONES_IMPRESION: ReadonlyArray<{
  readonly etiqueta: string;
  readonly accion: AccionImpresion;
}> = [
  { etiqueta: "Sí, imprimir", accion: "ticket" },
  { etiqueta: "Sí, en A4", accion: "a4" },
  { etiqueta: "No, gracias", accion: "ninguna" },
];

/** La acción que corresponde a la fila resaltada. Fuera de rango: no imprimir. */
export function accionImpresionDe(cursor: number): AccionImpresion {
  return OPCIONES_IMPRESION[cursor]?.accion ?? "ninguna";
}

/** Paso siguiente tras elegir el medio de pago en el primer paso del wizard. */
export function pasoTrasElegirMedio(
  forma: FormaDePago,
  cantidadTarjetas: number,
  cantidadClientes: number,
  clienteYaElegido: boolean,
): PasoAsistente {
  if (forma === FormaDePago.Tarjeta && cantidadTarjetas > 0) return "tarjeta";
  if (forma === FormaDePago.CuentaCorriente && cantidadClientes > 0 && !clienteYaElegido) {
    return "cliente";
  }
  return "monto";
}

/** Paso siguiente tras elegir la tarjeta/banco: cuotas si tiene tasas cargadas. */
export function pasoTrasElegirTarjeta(cantidadTasas: number): PasoAsistente {
  return cantidadTasas > 0 ? "cuotas" : "monto";
}

/**
 * Esc = volver un paso atrás. Se apoya en el historial de pasos recorridos
 * (en vez de re-deducir de dónde se vino) para que el camino de vuelta sea
 * exactamente el de ida: monto → cuotas → tarjeta → medio, o monto →
 * cliente → medio, según corresponda. Sin historial, el asistente se cierra.
 */
export function volverPasoAtras(historial: readonly PasoAsistente[]): {
  readonly paso: PasoAsistente;
  readonly historial: PasoAsistente[];
} {
  const anterior = historial[historial.length - 1];
  if (anterior === undefined) return { paso: "cerrado", historial: [] };
  return { paso: anterior, historial: historial.slice(0, -1) };
}

/**
 * Monto base a precargar en el paso "monto" para saldar el pendiente exacto
 * con una tarjeta que tiene recargo: `base = saldo / (1 + tasa/100)`, la
 * misma cuenta que ya hace `pagoExacto()` en `PantallaPos.tsx` para que un
 * pago con tarjeta a cuotas cierre la venta en un solo Enter.
 */
export function montoBaseParaSaldoExacto(saldoPendiente: Money, recargoPorcentaje: number): Money {
  if (recargoPorcentaje <= 0) return saldoPendiente;
  return saldoPendiente.dividirPor(1 + recargoPorcentaje / 100).redondear(2);
}

/**
 * `true` si el pago resultante (ya con recargo incluido si corresponde)
 * supera el saldo pendiente en un medio que no admite vuelto (todo menos
 * efectivo — ver `pago.ts`). Se usa para avisar *antes* de agregar el pago,
 * en vez de dejarlo agregado y que el error aparezca recién cuando falla el
 * recálculo del cobro.
 */
export function superaSaldoSinVuelto(
  forma: FormaDePago,
  montoResultante: Money,
  saldoPendiente: Money,
): boolean {
  if (forma === FormaDePago.Efectivo) return false;
  return montoResultante.mayorQue(saldoPendiente);
}
