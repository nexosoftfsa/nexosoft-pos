/**
 * Qué puede hacer cada plan (ADR-0067 §3).
 *
 * **El backend es la autoridad.** El POS también gatea el menú por plan, pero
 * eso es UX: acá se decide de verdad, igual que con los roles (CLAUDE.md §5).
 *
 * Dos reglas hacen todo el trabajo:
 *
 * 1. **Las lecturas nunca se bloquean.** De ahí sale gratis la promesa de
 *    ADR-0067 §6: bajar de plan hace perder la posibilidad de *crear* cosas
 *    nuevas, nunca la de ver o exportar lo que ya existe. Son datos del
 *    comercio, no nuestros.
 * 2. **Una ruta que no está en la tabla queda habilitada.** Se prefiere que un
 *    módulo nuevo se venda de más antes que romperle una operación a alguien
 *    que pagó. El costo es que hay que acordarse de agregarlo, y por eso el
 *    test recorre la tabla.
 */
import { moduloDisponible, type ModuloId, type Plan } from '@nexosoft/licencias';
import { normalizar } from './operaciones-bloqueadas';

/**
 * De qué módulo es cada familia de rutas. El orden importa: gana el primer
 * patrón que matchea.
 *
 * Lo que no está acá —`/auth`, `/sync`, `/terminales`, `/health`, `/licencia`—
 * es infraestructura, no un módulo que se venda: nunca se gatea por plan.
 */
const MODULO_DE_RUTA: ReadonlyArray<{ patron: RegExp; modulo: ModuloId }> = [
  { patron: /^\/ventas/, modulo: 'pos' },
  { patron: /^\/caja/, modulo: 'caja' },
  { patron: /^\/fiscal/, modulo: 'comprobantes' },
  { patron: /^\/catalogo/, modulo: 'catalogo' },
  { patron: /^\/stock/, modulo: 'stock' },
  { patron: /^\/comercio/, modulo: 'config' },
  { patron: /^\/usuarios/, modulo: 'usuarios' },
  { patron: /^\/credenciales/, modulo: 'usuarios' },

  // Plus
  { patron: /^\/clientes/, modulo: 'ctacte' },
  { patron: /^\/presupuestos/, modulo: 'presupuestos' },
  { patron: /^\/remitos/, modulo: 'remitos' },
  { patron: /^\/proveedores/, modulo: 'proveedores' },
  { patron: /^\/medios-pago/, modulo: 'medios-pago' },
  { patron: /^\/reportes/, modulo: 'reportes' },

  // Premium
  { patron: /^\/asistente/, modulo: 'ia' },
  { patron: /^\/acceso-remoto/, modulo: 'acceso-remoto' },
  { patron: /^\/respaldo/, modulo: 'respaldo-nube' },
];

/** El módulo al que pertenece una ruta, o `null` si no se gatea por plan. */
export function moduloDeRuta(ruta: string): ModuloId | null {
  const normalizada = normalizar(ruta);
  return MODULO_DE_RUTA.find((m) => m.patron.test(normalizada))?.modulo ?? null;
}

/**
 * `true` si esta operación debe rechazarse porque el plan del comercio no la
 * incluye. Las lecturas nunca se rechazan.
 */
export function fueraDelPlan(metodo: string, ruta: string, plan: Plan): boolean {
  const m = metodo.toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return false;
  const modulo = moduloDeRuta(ruta);
  if (modulo === null) return false;
  return !moduloDisponible(modulo, plan);
}
