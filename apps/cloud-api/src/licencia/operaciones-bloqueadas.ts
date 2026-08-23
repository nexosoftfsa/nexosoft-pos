/**
 * Qué se puede hacer con la suscripción `BLOQUEADA` (ADR-0056 §4).
 *
 * Se bloquea **vender**, que es lo que hace efectivo el corte. Quedan
 * habilitados cerrar la caja abierta y consultar o exportar lo histórico:
 * son registros fiscales del comercio, no nuestros — retenerlos nos expone y
 * no agrega presión de cobro real. Y queda habilitada la configuración, para
 * poder desbloquear cuando paguen.
 *
 * Igual que la lista de ADR-0057, es una **lista blanca de escrituras**: lo
 * que no está acá se bloquea. Si mañana aparece una operación nueva que
 * tendría que seguir funcionando estando bloqueado, hay que agregarla.
 */

/** Prefijo global de la API (ver `setGlobalPrefix` en main.ts). */
const PREFIJO = '/api/v1';

/**
 * Escrituras que siguen permitidas con la suscripción bloqueada.
 * Cada entrada es método + comienzo de la ruta.
 */
const ESCRITURAS_PERMITIDAS: ReadonlyArray<{ metodo: string; patron: RegExp }> = [
  // Entrar al sistema: si no, no se puede ni ver el aviso de bloqueo.
  { metodo: 'POST', patron: /^\/auth\// },
  // Cerrar el turno de caja que quedó abierto. Bloquear esto dejaría una caja
  // abierta e inconsistente que después hay que arreglar a mano.
  { metodo: 'POST', patron: /^\/caja\/turnos\/[^/]+\/cerrar$/ },
  { metodo: 'POST', patron: /^\/caja\/cerrar/ },
  // Configuración del comercio: hace falta para poder reactivar.
  { metodo: 'PUT', patron: /^\/comercio\// },
];

/** Deja la ruta comparable: sin prefijo, sin query y sin barra final. */
function normalizar(ruta: string): string {
  const sinQuery = ruta.split('?')[0] ?? '';
  const sinPrefijo = sinQuery.startsWith(PREFIJO) ? sinQuery.slice(PREFIJO.length) : sinQuery;
  const limpia = sinPrefijo.replace(/\/+$/, '');
  return limpia === '' ? '/' : limpia;
}

/**
 * `true` si esta operación debe rechazarse porque la suscripción está
 * bloqueada. Las lecturas nunca se bloquean.
 */
export function bloqueadaPorSuscripcion(metodo: string, ruta: string): boolean {
  const m = metodo.toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return false;
  const normalizada = normalizar(ruta);
  return !ESCRITURAS_PERMITIDAS.some((p) => p.metodo === m && p.patron.test(normalizada));
}
