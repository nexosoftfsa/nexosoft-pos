/**
 * Adaptador SQLite del puerto `AlmacenDeOperaciones` (@nexosoft/sync).
 *
 * Persiste la cola outbox del POS para que sobreviva a cierres y cortes de luz.
 * Se apoya en `EjecutorSql` (@nexosoft/app, ADR-0017): en Tauri lo implementa
 * `@tauri-apps/plugin-sql`; en tests, `node:sqlite`. Así es testeable sin Tauri.
 */
import type { EjecutorSql, Fila } from "@nexosoft/app";
import type {
  AlmacenDeOperaciones,
  EstadoOperacion,
  OperacionEnCola,
  OperacionSync,
  TipoOperacion,
} from "@nexosoft/sync";

/** Sentencia de creación de la tabla de la cola (idempotente). */
export const SENTENCIA_TABLA_SYNC = `CREATE TABLE IF NOT EXISTS operacion_sync (
  operacion_id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL,
  payload TEXT NOT NULL,
  terminal_id TEXT NOT NULL,
  creada_en TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','enviando','completada','fallida')),
  intentos INTEGER NOT NULL DEFAULT 0,
  ultimo_error TEXT
)`;

export async function crearTablaSync(ejecutor: EjecutorSql): Promise<void> {
  await ejecutor.ejecutar(SENTENCIA_TABLA_SYNC);
}

interface FilaOperacion extends Fila {
  operacion_id: string;
  tipo: string;
  payload: string;
  terminal_id: string;
  creada_en: string;
  estado: string;
  intentos: number;
  ultimo_error: string | null;
}

function aOperacion(f: FilaOperacion): OperacionEnCola {
  const base: OperacionEnCola = {
    operacionId: f.operacion_id,
    tipo: f.tipo as TipoOperacion,
    payload: JSON.parse(f.payload) as unknown,
    terminalId: f.terminal_id,
    creadaEn: f.creada_en,
    estado: f.estado as EstadoOperacion,
    intentos: f.intentos,
  };
  return f.ultimo_error === null ? base : { ...base, ultimoError: f.ultimo_error };
}

export class AlmacenSqlite implements AlmacenDeOperaciones {
  constructor(private readonly ejecutor: EjecutorSql) {}

  async encolar(op: OperacionSync): Promise<void> {
    // INSERT OR IGNORE: idempotente por operacionId (PK).
    await this.ejecutor.ejecutar(
      `INSERT OR IGNORE INTO operacion_sync
         (operacion_id, tipo, payload, terminal_id, creada_en, estado, intentos)
       VALUES (?, ?, ?, ?, ?, 'pendiente', 0)`,
      [op.operacionId, op.tipo, JSON.stringify(op.payload), op.terminalId, op.creadaEn],
    );
  }

  async pendientes(limite?: number): Promise<OperacionEnCola[]> {
    const sql =
      `SELECT * FROM operacion_sync WHERE estado = 'pendiente' ORDER BY creada_en ASC` +
      (limite !== undefined ? ` LIMIT ${Math.trunc(limite)}` : "");
    const filas = await this.ejecutor.consultar<FilaOperacion>(sql);
    return filas.map(aOperacion);
  }

  async marcar(
    operacionId: string,
    estado: EstadoOperacion,
    datos?: { readonly intentos?: number; readonly ultimoError?: string },
  ): Promise<void> {
    await this.ejecutor.ejecutar(
      `UPDATE operacion_sync
         SET estado = ?,
             intentos = COALESCE(?, intentos),
             ultimo_error = COALESCE(?, ultimo_error)
       WHERE operacion_id = ?`,
      [estado, datos?.intentos ?? null, datos?.ultimoError ?? null, operacionId],
    );
  }

  async obtener(operacionId: string): Promise<OperacionEnCola | undefined> {
    const filas = await this.ejecutor.consultar<FilaOperacion>(
      `SELECT * FROM operacion_sync WHERE operacion_id = ?`,
      [operacionId],
    );
    const fila = filas[0];
    return fila === undefined ? undefined : aOperacion(fila);
  }

  async todas(): Promise<OperacionEnCola[]> {
    const filas = await this.ejecutor.consultar<FilaOperacion>(
      `SELECT * FROM operacion_sync ORDER BY creada_en ASC`,
    );
    return filas.map(aOperacion);
  }

  async reintentarFallidas(): Promise<number> {
    const n = await this.cuantasFallidas();
    if (n > 0) {
      await this.ejecutor.ejecutar(
        `UPDATE operacion_sync SET estado = 'pendiente', intentos = 0, ultimo_error = NULL
         WHERE estado = 'fallida'`,
      );
    }
    return n;
  }

  /**
   * Borra las fallidas en vez de marcarlas con un estado nuevo: el `CHECK` de
   * la tabla no admite otro valor, y `CREATE TABLE IF NOT EXISTS` no lo
   * actualiza en las bases que ya están instaladas. Cambiarlo obligaría a
   * reconstruir la tabla en cada POS del campo, y el riesgo no compensa: lo que
   * se borra es una copia que no puede entrar a ningún lado. La venta queda.
   */
  async descartarFallidas(): Promise<number> {
    const n = await this.cuantasFallidas();
    if (n > 0) {
      await this.ejecutor.ejecutar(`DELETE FROM operacion_sync WHERE estado = 'fallida'`);
    }
    return n;
  }

  private async cuantasFallidas(): Promise<number> {
    const filas = await this.ejecutor.consultar<{ n: number }>(
      `SELECT COUNT(*) AS n FROM operacion_sync WHERE estado = 'fallida'`,
    );
    return Number(filas[0]?.n ?? 0);
  }
}
