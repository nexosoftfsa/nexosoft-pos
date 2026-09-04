/**
 * Planes comerciales: qué módulos habilita cada uno (ADR-0067).
 *
 * Este archivo es **puro**, como el resto del paquete: es la única tabla de
 * verdad sobre qué entra en cada plan, y la comparten el `cloud-api` (que la
 * impone) y el POS (que la muestra). Duplicarla sería garantizar que un día
 * digan cosas distintas.
 *
 * Lo que este archivo **no** sabe es cuánto sale cada plan. Los precios son un
 * dato comercial por comercio, viven en el panel y se cambian sin desplegar
 * nada (ADR-0067 §5).
 */

/** Los tres planes, de menor a mayor. */
export enum Plan {
  Basica = "BASICA",
  Plus = "PLUS",
  Premium = "PREMIUM",
}

/** De menor a mayor. El orden es la regla: un plan incluye todo lo anterior. */
export const ORDEN_PLANES: readonly Plan[] = [Plan.Basica, Plan.Plus, Plan.Premium];

/** Nombre para mostrarle al comercio. */
export const ETIQUETA_PLAN: Record<Plan, string> = {
  [Plan.Basica]: "Básica",
  [Plan.Plus]: "Plus",
  [Plan.Premium]: "Premium",
};

/**
 * Módulos y prestaciones que se gatean por plan.
 *
 * Los primeros son las secciones del menú del POS (`shell/modulos.tsx`); los
 * últimos no tienen entrada propia en el menú pero se venden igual (viven
 * dentro de Configuración, o todavía no existen).
 */
export type ModuloId =
  | "inicio"
  | "pos"
  | "caja"
  | "comprobantes"
  | "presupuestos"
  | "remitos"
  | "catalogo"
  | "stock"
  | "ctacte"
  | "etiquetas"
  | "proveedores"
  | "medios-pago"
  | "reportes"
  | "ia"
  | "usuarios"
  | "config"
  | "acceso-remoto"
  | "respaldo-nube"
  | "contable";

/**
 * El plan mínimo que habilita cada módulo (ADR-0067 §7).
 *
 * **Un módulo nuevo tiene que agregarse acá.** Si falta, TypeScript no
 * compila: el `Record<ModuloId, Plan>` obliga a que estén todos.
 */
export const PLAN_MINIMO: Record<ModuloId, Plan> = {
  // Básica — vendo, facturo y sé lo que tengo.
  inicio: Plan.Basica,
  pos: Plan.Basica,
  caja: Plan.Basica,
  comprobantes: Plan.Basica,
  catalogo: Plan.Basica,
  stock: Plan.Basica,
  usuarios: Plan.Basica,
  config: Plan.Basica,

  // Plus — además gestiono clientes, deuda y papeles.
  ctacte: Plan.Plus,
  presupuestos: Plan.Plus,
  remitos: Plan.Plus,
  proveedores: Plan.Plus,
  "medios-pago": Plan.Plus,
  etiquetas: Plan.Plus,
  reportes: Plan.Plus,

  // Premium — miro el negocio desde afuera.
  ia: Plan.Premium,
  "acceso-remoto": Plan.Premium,
  "respaldo-nube": Plan.Premium,
  // Todavía no existe (ver ADR-0067 §7). Anotado para no rediscutir la tabla.
  contable: Plan.Premium,
};

/**
 * Interpreta el campo `plan` de una licencia.
 *
 * **Lo que no viene, o no se entiende, es Premium.** Los comercios instalados
 * antes de ADR-0067 tienen tokens sin este campo, y el Worker puede tardar en
 * emitir uno nuevo: si la ausencia significara Básica, una demora nuestra le
 * apagaría módulos a un cliente que los tiene pagos. Ante la duda, el sistema
 * se equivoca para el lado de dejar trabajar (ADR-0067 §2).
 */
export function planDeLicencia(valor: unknown): Plan {
  return esPlan(valor) ? valor : Plan.Premium;
}

export function esPlan(valor: unknown): valor is Plan {
  return typeof valor === "string" && (ORDEN_PLANES as readonly string[]).includes(valor);
}

/** `true` si `plan` llega al escalón `minimo` o lo supera. */
export function alcanzaPlan(plan: Plan, minimo: Plan): boolean {
  return ORDEN_PLANES.indexOf(plan) >= ORDEN_PLANES.indexOf(minimo);
}

/** `true` si el comercio, con su plan, tiene habilitado ese módulo. */
export function moduloDisponible(modulo: ModuloId, plan: Plan): boolean {
  return alcanzaPlan(plan, PLAN_MINIMO[modulo]);
}

/**
 * El plan que hay que contratar para tener ese módulo. Es lo que se muestra en
 * el candado del menú: "Disponible en Plus" (ADR-0067 §4).
 */
export function planQueLoHabilita(modulo: ModuloId): Plan {
  return PLAN_MINIMO[modulo];
}

export function esModuloId(valor: unknown): valor is ModuloId {
  return typeof valor === "string" && Object.prototype.hasOwnProperty.call(PLAN_MINIMO, valor);
}
