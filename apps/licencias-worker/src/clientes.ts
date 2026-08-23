/**
 * Los comercios y su suscripción, guardados en KV (ADR-0056 §1).
 *
 * Un registro por comercio. Son decenas de comercios con una consulta por día:
 * el plan gratuito de KV sobra.
 */

export type EstadoSuscripcion = "ACTIVA" | "RECORDATORIO" | "ADVERTENCIA" | "BLOQUEADA";

export const ESTADOS: readonly EstadoSuscripcion[] = [
  "ACTIVA",
  "RECORDATORIO",
  "ADVERTENCIA",
  "BLOQUEADA",
];

export interface Cliente {
  readonly comercioId: string;
  /** Nombre para mostrar en el panel ("Lagus Minimarket"). */
  nombre: string;
  estado: EstadoSuscripcion;
  /** Fecha de pago de la suscripción, `YYYY-MM-DD`. */
  vencePagoEl: string;
  /** Texto opcional que se le muestra al comercio en el POS. */
  mensaje?: string | null;
  creadoEn: string;
  /** Heartbeat: cuándo se conectó por última vez y con qué versión. */
  ultimoContacto?: string | null;
  ultimaVersion?: string | null;
  /** Bitácora de cambios de estado, para saber quién movió qué y cuándo. */
  historial?: { fecha: string; estado: EstadoSuscripcion }[];
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

export function claveDe(comercioId: string): string {
  return `${PREFIJO}${comercioId}`;
}

export async function leerCliente(kv: KVNamespace, comercioId: string): Promise<Cliente | null> {
  return kv.get<Cliente>(claveDe(comercioId), "json");
}

export async function guardarCliente(kv: KVNamespace, cliente: Cliente): Promise<void> {
  await kv.put(claveDe(cliente.comercioId), JSON.stringify(cliente));
}

export async function listarClientes(kv: KVNamespace): Promise<Cliente[]> {
  const lista = await kv.list({ prefix: PREFIJO });
  const clientes: Cliente[] = [];
  for (const clave of lista.keys) {
    const c = await kv.get<Cliente>(clave.name, "json");
    if (c !== null) clientes.push(c);
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

/** `YYYY-MM-DD` de una fecha, en UTC. */
export function soloFecha(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
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
    estado: cliente.estado,
    vencePagoEl: cliente.vencePagoEl,
    validaHasta: validaHasta.toISOString(),
    mensaje: cliente.mensaje ?? null,
    emitidaEn: ahora.toISOString(),
  };
}
