/**
 * Qué se puede hacer **a través del túnel** (Fase 17.C, ADR-0057).
 *
 * Cuando el panel se publica en internet (ADR-0055), el túnel no expone sólo
 * el panel: expone toda la API del comercio. Si a alguien le roban una
 * credencial de ADMIN, desde afuera podría tocar catálogo, usuarios y ventas.
 *
 * Pero `admin-web` es de **sólo lectura** por diseño (ADR-0024), así que
 * restringir lo que entra por el túnel no le saca nada al comercio y baja el
 * daño posible de una credencial robada: de "control total" a "vio los
 * reportes".
 *
 * Es una **lista blanca**: lo que no está acá, no pasa. Denegar por defecto
 * es lo que hace que agregar un endpoint nuevo al servidor no abra un agujero
 * remoto sin que nadie se entere.
 *
 * Hoy la lista es exactamente lo que pide el panel (ver
 * `apps/admin-web/src/api/`): si le agregás una llamada nueva a `admin-web`,
 * tenés que agregarla acá o va a fallar **sólo desde afuera**, que es el peor
 * lugar para descubrirlo.
 */

interface RutaPermitida {
  readonly metodo: string;
  readonly patron: RegExp;
}

const PERMITIDAS: readonly RutaPermitida[] = [
  // Entrar al panel. Es el único POST que pasa: sin esto no hay sesión.
  { metodo: 'POST', patron: /^\/auth\/login$/ },
  // Diagnóstico, y lo que usa el propio servidor para comprobar que el túnel
  // responde desde afuera.
  { metodo: 'GET', patron: /^\/health$/ },
  // Branding del panel.
  { metodo: 'GET', patron: /^\/comercio\/logo$/ },
  // Todos los reportes, incluido el libro de ventas en Excel.
  { metodo: 'GET', patron: /^\/reportes(\/|$)/ },
];

/** Prefijo global de la API (ver `setGlobalPrefix` en main.ts). */
const PREFIJO = '/api/v1';

/** Deja la ruta comparable: sin prefijo, sin query y sin barra final. */
export function normalizarRuta(ruta: string): string {
  const sinQuery = ruta.split('?')[0] ?? '';
  const sinPrefijo = sinQuery.startsWith(PREFIJO) ? sinQuery.slice(PREFIJO.length) : sinQuery;
  const limpia = sinPrefijo.replace(/\/+$/, '');
  return limpia === '' ? '/' : limpia;
}

/**
 * `true` si esta petición puede atenderse cuando entra por el túnel.
 * Todo lo demás se rechaza con 403 — ver `RestriccionRemotaGuard`.
 */
export function permitidaEnRemoto(metodo: string, ruta: string): boolean {
  const m = metodo.toUpperCase();
  // OPTIONS es el preflight de CORS: negarlo rompería el panel sin ganar nada,
  // porque no lleva datos ni ejecuta nada.
  if (m === 'OPTIONS') return true;
  const normalizada = normalizarRuta(ruta);
  return PERMITIDAS.some((p) => p.metodo === m && p.patron.test(normalizada));
}
