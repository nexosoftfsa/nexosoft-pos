/**
 * Cuándo se puede desarmar lo que se mandó a imprimir.
 *
 * Suena a detalle y es el centro de un bug que colgó la aplicación entera. Al
 * imprimir, la hoja se monta en el DOM y el `<body>` gana una clase que la hace
 * visible bajo `@media print`. La pregunta es cuándo sacar las dos cosas.
 *
 * `afterprint` **no** sirve: se dispara al cerrar la vista previa, y después de
 * eso todavía falta guardar el PDF o mandar el trabajo a la cola, que siguen
 * leyendo el documento. Limpiar ahí es sacarle el papel de la mano a quien está
 * escribiendo. El 12/10/2026, exportando una reimpresión a PDF, eso terminó en
 * "Microsoft Edge WebView2 no responde" con el "Guardar como" colgado.
 *
 * Entonces la limpieza queda **pendiente** y se salda en el primero de dos
 * momentos, los dos posteriores al trabajo con certeza:
 *
 * 1. **Al empezar la impresión siguiente.** Si hay otra, la anterior terminó.
 *    Es la señal confiable.
 * 2. **Pasado un plazo de gracia largo** desde que se cerró la vista previa.
 *    Es higiene, no corrección: evita que una instalación que imprime una vez
 *    por día quede para siempre en modo impresión.
 *
 * Hay una sola limpieza pendiente para toda la app a propósito: no puede haber
 * dos impresiones en curso, así que la del ticket salda la del A4 y viceversa.
 */

/**
 * Cuánto se espera desde `afterprint` antes de limpiar por las dudas.
 *
 * No es lo que tarda una impresión: es el margen para la más lenta que podamos
 * imaginar —un PDF guardado en una carpeta sincronizada con OneDrive, una
 * térmica USB con la cola llena— sin dejar de limpiar nunca.
 */
export const GRACIA_MS = 60_000;

let pendiente: (() => void) | null = null;
let temporizador: ReturnType<typeof setTimeout> | undefined;

/** Registra la limpieza de la impresión que arranca. No la corre. */
export function dejarLimpiezaPendiente(limpieza: () => void): void {
  pendiente = limpieza;
}

/**
 * Corre la limpieza pendiente, si hay alguna, y cancela el plazo de gracia.
 * Idempotente: llamarla dos veces no limpia dos veces.
 */
export function saldarLimpieza(): void {
  clearTimeout(temporizador);
  temporizador = undefined;
  const limpieza = pendiente;
  pendiente = null;
  limpieza?.();
}

/**
 * Arranca el plazo de gracia. Se llama al cerrarse la vista previa, que es lo
 * más temprano que podemos enterarnos de algo — pero no es el final del
 * trabajo, por eso se espera en vez de limpiar.
 */
export function arrancarPlazoDeGracia(ms: number = GRACIA_MS): void {
  clearTimeout(temporizador);
  temporizador = setTimeout(saldarLimpieza, ms);
}

/** Sólo para tests: deja el módulo como recién cargado. */
export function reiniciarLimpieza(): void {
  clearTimeout(temporizador);
  temporizador = undefined;
  pendiente = null;
}
