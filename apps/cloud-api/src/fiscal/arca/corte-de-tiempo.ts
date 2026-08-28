/**
 * Distinguir "ARCA tardó demasiado" de "no se pudo llegar a ARCA".
 *
 * Los dos son transitorios y los dos dejan la venta en PENDIENTE, pero el
 * mensaje que ve el comercio es distinto: uno se arregla revisando internet y
 * el otro no se arregla con nada de este lado. Lo usan WSAA y WSFEv1.
 */

/** ¿El fetch se cortó por el timeout que le pusimos, y no por un error de red? */
export function esCorteDeTiempo(e: unknown): boolean {
  const nombre = (e as Error | undefined)?.name;
  return nombre === 'TimeoutError' || nombre === 'AbortError';
}
