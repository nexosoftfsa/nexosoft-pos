/**
 * Adaptador de `EjecutorSql` (@nexosoft/app, ADR-0017) sobre
 * `@tauri-apps/plugin-sql`. Es la implementación de PRODUCCIÓN del puerto: corre
 * dentro de la app Tauri, sobre SQLite real persistido en el disco del comercio.
 *
 * Dos detalles que justifican este adaptador (ver ADR-0022):
 *
 * 1. **Placeholders.** Nuestros repos y esquema emiten placeholders posicionales
 *    `?` (estilo SQLite nativo / `node:sqlite` de los tests). Pero el plugin usa
 *    `sqlx`, que para SQLite espera la sintaxis `$1, $2, …`. Por eso reescribimos
 *    `?` → `$N` antes de delegar. El SQL del dominio NO contiene `?` dentro de
 *    literales de texto, así que el reemplazo secuencial es seguro.
 * 2. **Claves foráneas.** SQLite arranca con `foreign_keys = OFF`; el esquema
 *    delega en el adaptador activarlas al abrir la conexión (ver `esquema.ts`).
 *
 * Se inyecta el cargador de la base para poder testear sin Tauri: en los tests se
 * pasa un doble; en producción se usa el import real del plugin (dinámico, para
 * no cargar `@tauri-apps/plugin-sql` fuera de la app nativa).
 */
import type { EjecutorSql, Fila, ValorSql } from "@nexosoft/app";

/** Ruta SQLite por defecto (relativa a `BaseDirectory::App` de Tauri). */
export const RUTA_SQLITE_DEFECTO = "sqlite:nexosoft.db";

/**
 * Contrato mínimo de la base que necesita el adaptador. `Database` del plugin
 * (`@tauri-apps/plugin-sql`) lo satisface estructuralmente; en tests se usa un doble.
 */
export interface BaseDatosSql {
  execute(query: string, bindValues?: unknown[]): Promise<{ rowsAffected: number; lastInsertId?: number }>;
  select<T>(query: string, bindValues?: unknown[]): Promise<T>;
  close(): Promise<boolean>;
}

/** Abre/conecta la base a partir de una ruta `sqlite:...`. */
export type CargadorSql = (ruta: string) => Promise<BaseDatosSql>;

/**
 * Reescribe los placeholders posicionales `?` a la sintaxis `$1, $2, …` que
 * espera `sqlx` para SQLite. Asume que el SQL no contiene `?` dentro de literales
 * de texto (se cumple en todo el SQL del proyecto: ver `esquema.ts` y los repos).
 */
export function reescribirPlaceholders(sql: string): string {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

/** Cargador por defecto: import dinámico del plugin real (solo dentro de Tauri). */
const cargarConPlugin: CargadorSql = async (ruta) => {
  const mod = await import("@tauri-apps/plugin-sql");
  return mod.default.load(ruta) as Promise<BaseDatosSql>;
};

export class EjecutorSqlTauri implements EjecutorSql {
  private constructor(private readonly db: BaseDatosSql) {}

  /**
   * Abre la base, activa las claves foráneas y devuelve el ejecutor listo.
   * @param ruta     Ruta `sqlite:...` (por defecto `RUTA_SQLITE_DEFECTO`).
   * @param cargar   Cargador inyectable (para testear sin Tauri).
   */
  static async abrir(
    ruta: string = RUTA_SQLITE_DEFECTO,
    cargar: CargadorSql = cargarConPlugin,
  ): Promise<EjecutorSqlTauri> {
    const db = await cargar(ruta);
    const ejecutor = new EjecutorSqlTauri(db);
    await db.execute("PRAGMA foreign_keys = ON");
    return ejecutor;
  }

  async ejecutar(sql: string, params: readonly ValorSql[] = []): Promise<void> {
    await this.db.execute(reescribirPlaceholders(sql), params as unknown[]);
  }

  async consultar<T extends Fila = Fila>(
    sql: string,
    params: readonly ValorSql[] = [],
  ): Promise<T[]> {
    return this.db.select<T[]>(reescribirPlaceholders(sql), params as unknown[]);
  }

  /** Cierra el pool de conexiones (al cerrar la app). */
  async cerrar(): Promise<void> {
    await this.db.close();
  }
}

/**
 * ¿Estamos corriendo dentro de la app Tauri (y no en el navegador de desarrollo)?
 * Tauri v2 inyecta `__TAURI_INTERNALS__` en `window`. Se usa para elegir el
 * bootstrap (SQLite + HTTP en Tauri; memoria + simulado en el navegador).
 */
export function estaEnTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
