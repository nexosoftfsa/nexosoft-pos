import { createRequire } from "node:module";

import { describe, expect, it, vi } from "vitest";
import {
  EjecutorSqlTauri,
  estaEnTauri,
  reescribirPlaceholders,
  RUTA_SQLITE_DEFECTO,
  type BaseDatosSql,
} from "./ejecutor-sql-tauri";

// node:sqlite vía require para que Vite no intente resolverlo en build.
const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir("node:sqlite") as typeof import("node:sqlite");

/**
 * `BaseDatosSql` sobre node:sqlite (SQLite real en memoria) para probar la
 * atomicidad de verdad. Traduce los placeholders `$N` (que emite el ejecutor)
 * de vuelta a `?`, que es lo que entiende node:sqlite.
 */
function crearBaseNodeSqlite(): BaseDatosSql {
  const db = new DatabaseSync(":memory:");
  const aInterrogante = (sql: string): string => sql.replace(/\$\d+/g, "?");
  return {
    async execute(query: string, bindValues: unknown[] = []) {
      const sql = aInterrogante(query);
      if (bindValues.length === 0) db.exec(sql);
      else db.prepare(sql).run(...(bindValues as never[]));
      return { rowsAffected: 0 };
    },
    async select<T>(query: string, bindValues: unknown[] = []) {
      return db.prepare(aInterrogante(query)).all(...(bindValues as never[])) as T;
    },
    async close() {
      db.close();
      return true;
    },
  };
}

/** Doble de la base que registra cada llamada y permite fijar el resultado de `select`. */
function crearBaseFalsa(filas: unknown[] = []) {
  const ejecuciones: { sql: string; params: unknown[] | undefined }[] = [];
  const selects: { sql: string; params: unknown[] | undefined }[] = [];
  const db: BaseDatosSql = {
    execute: vi.fn(async (sql: string, params?: unknown[]) => {
      ejecuciones.push({ sql, params });
      return { rowsAffected: 1 };
    }),
    select: vi.fn(async (sql: string, params?: unknown[]) => {
      selects.push({ sql, params });
      return filas as never;
    }),
    close: vi.fn(async () => true),
  };
  return { db, ejecuciones, selects };
}

describe("reescribirPlaceholders", () => {
  it("deja el SQL intacto cuando no hay placeholders", () => {
    expect(reescribirPlaceholders("SELECT * FROM articulo")).toBe("SELECT * FROM articulo");
  });

  it("reemplaza un único `?` por `$1`", () => {
    expect(reescribirPlaceholders("SELECT * FROM articulo WHERE id = ?")).toBe(
      "SELECT * FROM articulo WHERE id = $1",
    );
  });

  it("numera los placeholders en orden de aparición", () => {
    expect(
      reescribirPlaceholders("INSERT INTO pago (id, venta_id, monto_cent) VALUES (?, ?, ?)"),
    ).toBe("INSERT INTO pago (id, venta_id, monto_cent) VALUES ($1, $2, $3)");
  });
});

describe("EjecutorSqlTauri.abrir", () => {
  it("usa la ruta por defecto y activa las claves foráneas al abrir", async () => {
    const { db, ejecuciones } = crearBaseFalsa();
    const cargar = vi.fn(async () => db);

    await EjecutorSqlTauri.abrir(RUTA_SQLITE_DEFECTO, cargar);

    expect(cargar).toHaveBeenCalledWith(RUTA_SQLITE_DEFECTO);
    expect(ejecuciones[0]?.sql).toBe("PRAGMA foreign_keys = ON");
  });
});

describe("EjecutorSqlTauri.ejecutar / consultar", () => {
  it("reescribe placeholders y reenvía los params en `ejecutar`", async () => {
    const { db, ejecuciones } = crearBaseFalsa();
    const ejecutor = await EjecutorSqlTauri.abrir("sqlite:test.db", async () => db);

    await ejecutor.ejecutar("INSERT INTO articulo (id, descripcion) VALUES (?, ?)", ["a1", "Agua"]);

    // ejecuciones[0] es el PRAGMA; ejecuciones[1] es nuestro INSERT.
    expect(ejecuciones[1]).toEqual({
      sql: "INSERT INTO articulo (id, descripcion) VALUES ($1, $2)",
      params: ["a1", "Agua"],
    });
  });

  it("reescribe placeholders y devuelve las filas en `consultar`", async () => {
    const filas = [{ id: "a1", descripcion: "Agua" }];
    const { db, selects } = crearBaseFalsa(filas);
    const ejecutor = await EjecutorSqlTauri.abrir("sqlite:test.db", async () => db);

    const resultado = await ejecutor.consultar("SELECT * FROM articulo WHERE id = ?", ["a1"]);

    expect(resultado).toEqual(filas);
    expect(selects[0]).toEqual({
      sql: "SELECT * FROM articulo WHERE id = $1",
      params: ["a1"],
    });
  });

  it("cierra la base al llamar `cerrar`", async () => {
    const { db } = crearBaseFalsa();
    const ejecutor = await EjecutorSqlTauri.abrir("sqlite:test.db", async () => db);

    await ejecutor.cerrar();

    expect(db.close).toHaveBeenCalledOnce();
  });
});

describe("EjecutorSqlTauri.transaccion", () => {
  it("hace COMMIT y persiste lo escrito cuando `fn` no lanza", async () => {
    const ejecutor = await EjecutorSqlTauri.abrir("sqlite:test.db", async () => crearBaseNodeSqlite());
    await ejecutor.ejecutar("CREATE TABLE t (id TEXT PRIMARY KEY)");

    const resultado = await ejecutor.transaccion(async (tx) => {
      await tx.ejecutar("INSERT INTO t (id) VALUES (?)", ["a"]);
      await tx.ejecutar("INSERT INTO t (id) VALUES (?)", ["b"]);
      return "ok";
    });

    expect(resultado).toBe("ok");
    const filas = await ejecutor.consultar("SELECT id FROM t ORDER BY id");
    expect(filas.map((f) => f.id)).toEqual(["a", "b"]);
  });

  it("hace ROLLBACK y descarta lo escrito cuando `fn` lanza", async () => {
    const ejecutor = await EjecutorSqlTauri.abrir("sqlite:test.db", async () => crearBaseNodeSqlite());
    await ejecutor.ejecutar("CREATE TABLE t (id TEXT PRIMARY KEY)");
    await ejecutor.ejecutar("INSERT INTO t (id) VALUES (?)", ["previo"]);

    await expect(
      ejecutor.transaccion(async (tx) => {
        await tx.ejecutar("INSERT INTO t (id) VALUES (?)", ["a"]);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    // "a" se descartó; "previo" (de antes de la transacción) sigue.
    const filas = await ejecutor.consultar("SELECT id FROM t");
    expect(filas.map((f) => f.id)).toEqual(["previo"]);
  });

  it("serializa: una operación externa no se intercala entre BEGIN y COMMIT", async () => {
    const orden: string[] = [];
    const base: BaseDatosSql = {
      async execute(query: string) {
        orden.push(query);
        return { rowsAffected: 0 };
      },
      async select() {
        return [] as never;
      },
      async close() {
        return true;
      },
    };
    const ejecutor = await EjecutorSqlTauri.abrir("sqlite:test.db", async () => base);
    orden.length = 0; // descartar el PRAGMA del abrir

    const transaccion = ejecutor.transaccion(async (tx) => {
      await tx.ejecutar("INSERT A");
      await tx.ejecutar("INSERT B");
    });
    const externa = ejecutor.ejecutar("EXTERNA"); // encolada: debe correr DESPUÉS del COMMIT
    await Promise.all([transaccion, externa]);

    expect(orden).toEqual(["BEGIN", "INSERT A", "INSERT B", "COMMIT", "EXTERNA"]);
  });
});

describe("estaEnTauri", () => {
  it("es false en un entorno sin `__TAURI_INTERNALS__`", () => {
    expect(estaEnTauri()).toBe(false);
  });

  it("es true cuando `window.__TAURI_INTERNALS__` está presente", () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    try {
      expect(estaEnTauri()).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
