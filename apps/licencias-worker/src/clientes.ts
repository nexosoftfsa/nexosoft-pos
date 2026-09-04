/**
 * Los comercios y su suscripción, guardados en KV (ADR-0056 §1, ADR-0067).
 *
 * Un registro por comercio. Son decenas de comercios con una consulta por día:
 * el plan gratuito de KV sobra.
 *
 * Los tipos `EstadoSuscripcion` y `Plan` están repetidos acá a propósito: el
 * Worker se despliega solo, con wrangler, y no comparte el bundle del
 * monorepo. El contrato canónico vive en `@nexosoft/licencias` — si cambia
 * uno, hay que cambiar el otro, y para eso están los tests de las dos puntas.
 */

export type EstadoSuscripcion = "ACTIVA" | "RECORDATORIO" | "ADVERTENCIA" | "BLOQUEADA";

export const ESTADOS: readonly EstadoSuscripcion[] = [
  "ACTIVA",
  "RECORDATORIO",
  "ADVERTENCIA",
  "BLOQUEADA",
];

/** Planes comerciales (ADR-0067). Ver `packages/licencias/src/plan.ts`. */
export type Plan = "BASICA" | "PLUS" | "PREMIUM";

export const PLANES: readonly Plan[] = ["BASICA", "PLUS", "PREMIUM"];

/**
 * Cuánto sale la suscripción de ese comercio.
 *
 * El importe es **texto decimal, nunca `number`** (CLAUDE.md §3). Acá no se
 * hace aritmética —es un dato que se registra y se muestra—, así que no hace
 * falta traer `decimal.js` a un Worker; lo que sí hace falta es que un precio
 * no se convierta en `50.000000000000004` al pasar por un float.
 *
 * `moneda` es ISO de tres letras: "USD 50" en Argentina no es un número, es
 * una pregunta, y el panel tiene que poder decir en qué se acordó.
 */
export interface PrecioMensual {
  moneda: string;
  importe: string;
}

export interface Cliente {
  readonly comercioId: string;
  /** Nombre para mostrar en el panel ("Lagus Minimarket"). */
  nombre: string;
  /**
   * Estado **fijado a mano** desde el panel, o `null` si va en automático.
   *
   * Cuando es `null` el estado se deriva de `vencePagoEl` (ver
   * `estadoSegunFecha`): así es como el sistema avisa solo, sin que nadie
   * tenga que acordarse. **`BLOQUEADA` sólo se llega por acá**: el escalado
   * automático nunca bloquea a nadie.
   */
  estadoManual?: EstadoSuscripcion | null;
  /** Plan contratado (ADR-0067). Lo que no se entiende es PREMIUM. */
  plan: Plan;
  /** Fecha de pago de la suscripción, `YYYY-MM-DD`. */
  vencePagoEl: string;
  /** Lo acordado con ese comercio. `null` mientras no se cargó. */
  precioMensual?: PrecioMensual | null;
  /** Texto opcional que se le muestra al comercio en el POS. */
  mensaje?: string | null;
  creadoEn: string;
  /** Heartbeat: cuándo se conectó por última vez y con qué versión. */
  ultimoContacto?: string | null;
  ultimaVersion?: string | null;
  /** Bitácora de cambios, para saber quién movió qué y cuándo. */
  historial?: { fecha: string; estado: EstadoSuscripcion | null; nota?: string }[];
}

const PREFIJO = "cliente:";

/**
 * Cuántos comercios se pueden bloquear por día.
 *
 * Es una válvula de seguridad, no una regla de negocio: si alguien se roba el
 * token del panel, no puede dejar sin vender a toda la cartera de una sentada.
 * Y nos protege de nuestro propio error a las 2 de la mañana. Desbloquear no
 * tiene tope — ante la duda, el sistema se equivoca para el lado de dejar
 * trabajar al comercio.
 */
export const TOPE_BLOQUEOS_DIARIOS = 3;

/** Cuántos días antes del vencimiento empieza el aviso suave. */
export const DIAS_RECORDATORIO = 7;

export function claveDe(comercioId: string): string {
  return `${PREFIJO}${comercioId}`;
}

/**
 * Completa lo que falta en un registro viejo de KV.
 *
 * Los comercios dados de alta antes de ADR-0067 no tienen `plan` ni
 * `estadoManual`, y sí tienen un `estado` que se fijaba a mano. Ese estado
 * pasa a ser el override manual: es lo único que conserva el comportamiento
 * exacto que esos comercios tienen hoy. Quien quiera pasarlos a automático lo
 * hace desde el panel, a propósito.
 */
export function normalizar(crudo: Record<string, unknown>): Cliente {
  const viejoEstado = crudo["estado"];
  const estadoManual =
    crudo["estadoManual"] !== undefined
      ? esEstadoValido(crudo["estadoManual"])
        ? crudo["estadoManual"]
        : null
      : esEstadoValido(viejoEstado)
        ? viejoEstado
        : null;

  return {
    comercioId: String(crudo["comercioId"] ?? ""),
    nombre: String(crudo["nombre"] ?? crudo["comercioId"] ?? ""),
    estadoManual,
    // Un registro sin plan es PREMIUM, igual que una licencia sin plan: no le
    // vamos a apagar módulos a un cliente por una migración nuestra.
    plan: esPlanValido(crudo["plan"]) ? crudo["plan"] : "PREMIUM",
    vencePagoEl: typeof crudo["vencePagoEl"] === "string" ? crudo["vencePagoEl"] : "",
    precioMensual: esPrecioValido(crudo["precioMensual"]) ? crudo["precioMensual"] : null,
    mensaje: typeof crudo["mensaje"] === "string" ? crudo["mensaje"] : null,
    creadoEn: typeof crudo["creadoEn"] === "string" ? crudo["creadoEn"] : new Date().toISOString(),
    ultimoContacto: typeof crudo["ultimoContacto"] === "string" ? crudo["ultimoContacto"] : null,
    ultimaVersion: typeof crudo["ultimaVersion"] === "string" ? crudo["ultimaVersion"] : null,
    historial: Array.isArray(crudo["historial"])
      ? (crudo["historial"] as NonNullable<Cliente["historial"]>)
      : [],
  };
}

export async function leerCliente(kv: KVNamespace, comercioId: string): Promise<Cliente | null> {
  const crudo = await kv.get<Record<string, unknown>>(claveDe(comercioId), "json");
  return crudo === null ? null : normalizar(crudo);
}

export async function guardarCliente(kv: KVNamespace, cliente: Cliente): Promise<void> {
  await kv.put(claveDe(cliente.comercioId), JSON.stringify(cliente));
}

export async function listarClientes(kv: KVNamespace): Promise<Cliente[]> {
  const lista = await kv.list({ prefix: PREFIJO });
  const clientes: Cliente[] = [];
  for (const clave of lista.keys) {
    const c = await kv.get<Record<string, unknown>>(clave.name, "json");
    if (c !== null) clientes.push(normalizar(c));
  }
  return clientes.sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/** Clave del contador diario de bloqueos. */
function claveBloqueos(hoy: string): string {
  return `bloqueos:${hoy}`;
}

/**
 * Registra un bloqueo del día y dice si todavía está dentro del tope.
 * Devuelve `false` cuando se pasó — en ese caso no hay que bloquear.
 */
export async function permitirBloqueo(kv: KVNamespace, hoy: string): Promise<boolean> {
  const clave = claveBloqueos(hoy);
  const actual = Number((await kv.get(clave)) ?? "0");
  if (actual >= TOPE_BLOQUEOS_DIARIOS) return false;
  // Expira solo a los dos días: no hay que limpiar nada.
  await kv.put(clave, String(actual + 1), { expirationTtl: 172_800 });
  return true;
}

export function esEstadoValido(valor: unknown): valor is EstadoSuscripcion {
  return typeof valor === "string" && (ESTADOS as readonly string[]).includes(valor);
}

export function esPlanValido(valor: unknown): valor is Plan {
  return typeof valor === "string" && (PLANES as readonly string[]).includes(valor);
}

/** Importe decimal con hasta dos decimales, y moneda ISO de tres letras. */
export function esPrecioValido(valor: unknown): valor is PrecioMensual {
  if (typeof valor !== "object" || valor === null) return false;
  const { moneda, importe } = valor as Record<string, unknown>;
  return (
    typeof moneda === "string" &&
    /^[A-Z]{3}$/.test(moneda) &&
    typeof importe === "string" &&
    /^\d{1,9}(\.\d{1,2})?$/.test(importe)
  );
}

/** `YYYY-MM-DD` de una fecha, en UTC. */
export function soloFecha(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/**
 * El escalón que corresponde por calendario (ADR-0056 §4).
 *
 * **Nunca devuelve `BLOQUEADA`.** Bloquear a un comercio deja gente sin poder
 * trabajar: es una decisión que se toma apretando un botón, no un efecto
 * secundario de que se cumpla una fecha. Un bug de fechas acá, si pudiera
 * bloquear, apagaría cajas solo.
 */
export function estadoSegunFecha(vencePagoEl: string, hoy: string): EstadoSuscripcion {
  const dias = diasEntre(hoy, vencePagoEl);
  if (dias === null) return "ACTIVA";
  if (dias < 0) return "ADVERTENCIA";
  if (dias <= DIAS_RECORDATORIO) return "RECORDATORIO";
  return "ACTIVA";
}

/**
 * El estado que se le emite al comercio: lo fijado a mano si hay algo fijado,
 * y si no, lo que dice el calendario.
 */
export function estadoEfectivo(cliente: Cliente, hoy: string): EstadoSuscripcion {
  return cliente.estadoManual ?? estadoSegunFecha(cliente.vencePagoEl, hoy);
}

/**
 * El comercio pagó: se corre la fecha de vencimiento un mes y **se levanta
 * cualquier estado manual**, bloqueo incluido.
 *
 * Que pagar desbloquee de una es deliberado: desbloquear es siempre inmediato
 * (ADR-0056 §1). Y avanza de a meses enteros hasta pasar la fecha de hoy, para
 * conservar el día del mes acordado sin dejar la próxima fecha en el pasado
 * cuando alguien paga con mucho atraso.
 */
export function registrarPago(cliente: Cliente, hoy: string): Cliente {
  return {
    ...cliente,
    vencePagoEl: proximoVencimiento(cliente.vencePagoEl, hoy),
    estadoManual: null,
  };
}

export function proximoVencimiento(vencePagoEl: string, hoy: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vencePagoEl)) return sumarUnMes(hoy);
  let proxima = sumarUnMes(vencePagoEl);
  // Tope de seguridad: 10 años de vueltas es más que suficiente y evita que
  // una fecha absurda guardada en KV cuelgue el Worker.
  for (let i = 0; i < 120 && proxima <= hoy; i++) proxima = sumarUnMes(proxima);
  return proxima;
}

/** Suma un mes calendario, recortando el día si el mes destino es más corto. */
export function sumarUnMes(fecha: string): string {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  if (anio === undefined || mes === undefined || dia === undefined) return fecha;
  const anioDestino = mes === 12 ? anio + 1 : anio;
  const mesDestino = mes === 12 ? 1 : mes + 1;
  // Día 0 del mes siguiente = último día del mes destino.
  const ultimoDia = new Date(Date.UTC(anioDestino, mesDestino, 0)).getUTCDate();
  return `${anioDestino}-${dosDigitos(mesDestino)}-${dosDigitos(Math.min(dia, ultimoDia))}`;
}

/** Días desde `desde` hasta `hasta`. `null` si alguna fecha no es válida. */
export function diasEntre(desde: string, hasta: string): number | null {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

function dosDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Arma la licencia que se le va a firmar a un comercio. El token dura poco
 * (7 días) a propósito: es lo que hace que un cambio de estado en el panel
 * llegue rápido, y a la vez que un comercio sin internet siga trabajando.
 */
export function licenciaDe(cliente: Cliente, ahora: Date) {
  const validaHasta = new Date(ahora.getTime() + 7 * 24 * 60 * 60 * 1000);
  return {
    comercioId: cliente.comercioId,
    estado: estadoEfectivo(cliente, soloFecha(ahora)),
    plan: cliente.plan,
    vencePagoEl: cliente.vencePagoEl,
    validaHasta: validaHasta.toISOString(),
    mensaje: cliente.mensaje ?? null,
    emitidaEn: ahora.toISOString(),
  };
}
