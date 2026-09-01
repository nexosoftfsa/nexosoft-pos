/**
 * Saca a la luz por qué falló una llamada a ARCA.
 *
 * `fetch` de Node tira siempre el mismo `TypeError: fetch failed` y deja la
 * causa real —DNS, TLS, conexión rechazada, IPv6 sin salida— colgando en
 * `error.cause`. Nosotros mostrábamos sólo el mensaje de arriba, así que el
 * comercio veía "No se pudo contactar a ARCA (fetch failed)" y nadie podía
 * saber si era el DNS, el firewall o el certificado.
 *
 * Pasó de verdad: la primera prueba en producción se frenó un día entero en
 * ese mensaje, con todo bien configurado del lado de ARCA.
 *
 * Los códigos que más aparecen y qué significan:
 *
 * | Código | Qué pasó |
 * |---|---|
 * | `ENOTFOUND` / `EAI_AGAIN` | el DNS no resuelve el nombre |
 * | `ECONNREFUSED` | llegó, pero del otro lado no hay nadie escuchando |
 * | `ETIMEDOUT` / `ENETUNREACH` | no hay salida a esa dirección (firewall, IPv6) |
 * | `CERT_*` / `UNABLE_TO_VERIFY_*` | problema con el certificado del servidor |
 */

/** Hasta dónde seguir la cadena de causas, por si viene circular. */
const PROFUNDIDAD_MAX = 6;

interface ErrorConCausa {
  readonly message?: unknown;
  readonly code?: unknown;
  readonly errors?: unknown;
  readonly cause?: unknown;
}

function unaLinea(e: ErrorConCausa): string {
  const codigo = typeof e.code === 'string' ? e.code : '';
  const mensaje = typeof e.message === 'string' ? e.message : '';
  return [codigo, mensaje].filter((s) => s !== '').join(' ');
}

/**
 * El detalle completo de un fallo de red: el mensaje de arriba más toda la
 * cadena de causas, que es donde vive la explicación.
 */
export function detalleDeRed(error: unknown): string {
  const partes: string[] = [];
  let actual: unknown = error;

  for (let i = 0; i < PROFUNDIDAD_MAX && actual !== null && actual !== undefined; i++) {
    const e = actual as ErrorConCausa;
    const linea = unaLinea(e);
    if (linea !== '' && !partes.includes(linea)) partes.push(linea);

    // Con "happy eyeballs" (IPv4 + IPv6 en paralelo) Node junta los dos fallos
    // en un AggregateError; el interesante suele ser el de IPv6.
    if (Array.isArray(e.errors)) {
      for (const sub of e.errors.slice(0, 3)) {
        const l = unaLinea(sub as ErrorConCausa);
        if (l !== '' && !partes.includes(l)) partes.push(l);
      }
    }

    actual = e.cause;
  }

  return partes.length > 0 ? partes.join(' — ') : String(error);
}
