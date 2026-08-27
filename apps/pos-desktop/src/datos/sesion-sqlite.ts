/**
 * Persistencia de la sesión en SQLite (fila única id=1). Sobrevive a cierres de la
 * app: el POS es offline-first, así que el token cacheado permite seguir operando
 * sin reloguear cada vez (las ventas se encolan igual y suben cuando hay red).
 *
 * Nota de seguridad: los tokens quedan en el SQLite local del equipo (confianza
 * local de la terminal). Migrar a almacenamiento seguro del SO (keychain) es una
 * mejora posterior.
 */
import type { EjecutorSql, Fila } from "@nexosoft/app";

export const SENTENCIA_TABLA_SESION = `CREATE TABLE IF NOT EXISTS sesion (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  email TEXT NOT NULL,
  sucursal_id TEXT NOT NULL,
  terminal_id TEXT,
  terminal_nombre TEXT
)`;

export async function crearTablaSesion(ejecutor: EjecutorSql): Promise<void> {
  await ejecutor.ejecutar(SENTENCIA_TABLA_SESION);
}

export interface SesionGuardada {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly email: string;
  readonly sucursalId: string;
  readonly terminalId?: string;
  readonly terminalNombre?: string;
}

interface FilaSesion extends Fila {
  access_token: string;
  refresh_token: string;
  email: string;
  sucursal_id: string;
  terminal_id: string | null;
  terminal_nombre: string | null;
}

export async function leerSesion(ejecutor: EjecutorSql): Promise<SesionGuardada | null> {
  const filas = await ejecutor.consultar<FilaSesion>("SELECT * FROM sesion WHERE id = 1");
  const f = filas[0];
  if (f === undefined) return null;
  return {
    accessToken: f.access_token,
    refreshToken: f.refresh_token,
    email: f.email,
    sucursalId: f.sucursal_id,
    ...(f.terminal_id !== null ? { terminalId: f.terminal_id } : {}),
    ...(f.terminal_nombre !== null ? { terminalNombre: f.terminal_nombre } : {}),
  };
}

export async function guardarSesion(ejecutor: EjecutorSql, s: SesionGuardada): Promise<void> {
  await ejecutor.ejecutar(
    `INSERT INTO sesion (id, access_token, refresh_token, email, sucursal_id, terminal_id, terminal_nombre)
     VALUES (1, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       access_token=excluded.access_token, refresh_token=excluded.refresh_token,
       email=excluded.email, sucursal_id=excluded.sucursal_id,
       terminal_id=excluded.terminal_id, terminal_nombre=excluded.terminal_nombre`,
    [
      s.accessToken,
      s.refreshToken,
      s.email,
      s.sucursalId,
      s.terminalId ?? null,
      s.terminalNombre ?? null,
    ],
  );
}

/** Actualiza solo los tokens (tras un refresh), preservando email/sucursal/terminal. */
export async function actualizarTokens(
  ejecutor: EjecutorSql,
  accessToken: string,
  refreshToken: string,
): Promise<void> {
  await ejecutor.ejecutar(
    "UPDATE sesion SET access_token = ?, refresh_token = ? WHERE id = 1",
    [accessToken, refreshToken],
  );
}

/** Persiste la terminal elegida. */
export async function actualizarTerminal(
  ejecutor: EjecutorSql,
  terminalId: string,
  terminalNombre: string,
): Promise<void> {
  await ejecutor.ejecutar(
    "UPDATE sesion SET terminal_id = ?, terminal_nombre = ? WHERE id = 1",
    [terminalId, terminalNombre],
  );
}

export async function borrarSesion(ejecutor: EjecutorSql): Promise<void> {
  await ejecutor.ejecutar("DELETE FROM sesion WHERE id = 1");
}

/**
 * Olvida la terminal elegida, dejando la sesión abierta.
 *
 * Hace falta cuando el servidor ya no conoce esa terminal: pasa al reinstalar
 * el servidor desde cero, porque el POS guarda el id en SU base y ese id ya no
 * existe del otro lado. Sin esto el POS queda en un callejón — no se puede
 * abrir la caja y la sincronización rebota — y la única salida era cerrar
 * sesión.
 */
export async function olvidarTerminal(ejecutor: EjecutorSql): Promise<void> {
  await ejecutor.ejecutar(
    "UPDATE sesion SET terminal_id = NULL, terminal_nombre = NULL WHERE id = 1",
  );
}
