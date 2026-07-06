/**
 * `fetch` rechaza con un `TypeError` (mensaje tipo "Failed to fetch") cuando la
 * conexión ni siquiera pudo establecerse (servidor apagado, URL mal configurada,
 * sin red) — a diferencia de una respuesta HTTP de error, que sí llega con status.
 * Los clientes HTTP usan esto para no dejar pasar ese texto crudo a la UI.
 */
export function esFalloDeRed(e: unknown): boolean {
  return e instanceof TypeError;
}

export const MENSAJE_SIN_CONEXION =
  "No se pudo conectar con el servidor. Verificá que esté encendido y que la URL configurada sea correcta.";
