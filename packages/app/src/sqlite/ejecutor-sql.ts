/**
 * `EjecutorSql`: puerto mínimo de acceso a SQLite. Desacopla los repositorios de
 * QUIÉN ejecuta el SQL:
 *  - en el POS, lo implementa `@tauri-apps/plugin-sql` (Fase 1.4b, parte UI);
 *  - en los tests, lo implementa `node:sqlite` (SQLite real, sin Tauri).
 *
 * Usa placeholders posicionales `?`. El dinero viaja como entero (centavos) y las
 * cantidades como texto decimal (ver ADR-0007 / ADR-0015).
 */
export type ValorSql = string | number | null;

export type Fila = Record<string, ValorSql>;

export interface EjecutorSql {
  /** Ejecuta una sentencia que no devuelve filas (DDL, INSERT, UPDATE, DELETE). */
  ejecutar(sql: string, params?: readonly ValorSql[]): Promise<void>;
  /** Ejecuta un SELECT y devuelve las filas. */
  consultar<T extends Fila = Fila>(sql: string, params?: readonly ValorSql[]): Promise<T[]>;
}
