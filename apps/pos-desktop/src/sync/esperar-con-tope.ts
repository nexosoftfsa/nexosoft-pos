/**
 * Espera un resultado hasta un tope de tiempo, **sin cancelar** lo que quedó
 * corriendo.
 *
 * Es la diferencia que importa en la caja: al confirmar una venta fiscal se
 * espera un poco a que el servidor consiga el CAE, para que el ticket que se
 * lleva el cliente salga con CAE, QR y el número de ARCA. Si ARCA está lenta,
 * el cajero no puede quedarse mirando la pantalla con el cliente adelante.
 *
 * Pero abandonar la espera NO es abandonar la operación: la venta sigue su
 * curso en la cola y el CAE se consigue igual, un rato después. Cancelarla
 * sería romper la garantía de siempre (la venta no depende de ARCA).
 */
export async function esperarConTope<T>(
  trabajo: Promise<T>,
  topeMs: number,
): Promise<T | null> {
  let cortar: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      trabajo,
      new Promise<null>((resolver) => {
        cortar = setTimeout(() => resolver(null), topeMs);
      }),
    ]);
  } finally {
    clearTimeout(cortar);
  }
}
