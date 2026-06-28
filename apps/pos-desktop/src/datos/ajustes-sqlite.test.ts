import { createRequire } from "node:module";

import { beforeEach, describe, expect, it } from "vitest";

import type { EjecutorSql, Fila, ValorSql } from "@nexosoft/app";

import {
  crearTablaAjustes,
  guardarAjuste,
  guardarServidorUrl,
  leerAjuste,
  leerServidorUrl,
  URL_SERVIDOR_DEFECTO,
} from "./ajustes-sqlite";

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir("node:sqlite") as typeof import("node:sqlite");

class EjecutorNodeSqlite implements EjecutorSql {
  constructor(private readonly db: InstanceType<typeof DatabaseSync>) {}
  async ejecutar(sql: string, params: readonly ValorSql[] = []): Promise<void> {
    if (params.length === 0) this.db.exec(sql);
    else this.db.prepare(sql).run(...params);
  }
  async consultar<T extends Fila = Fila>(sql: string, params: readonly ValorSql[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...params) as unknown as T[];
  }
}

describe("ajustes-sqlite", () => {
  let ejecutor: EjecutorSql;

  beforeEach(async () => {
    ejecutor = new EjecutorNodeSqlite(new DatabaseSync(":memory:"));
    await crearTablaAjustes(ejecutor);
  });

  it("leerAjuste devuelve null si la clave no existe", async () => {
    expect(await leerAjuste(ejecutor, "x")).toBeNull();
  });

  it("guardarAjuste inserta y luego pisa (upsert)", async () => {
    await guardarAjuste(ejecutor, "k", "uno");
    expect(await leerAjuste(ejecutor, "k")).toBe("uno");
    await guardarAjuste(ejecutor, "k", "dos");
    expect(await leerAjuste(ejecutor, "k")).toBe("dos");
  });

  it("leerServidorUrl devuelve el default si no se configuró", async () => {
    expect(await leerServidorUrl(ejecutor)).toBe(URL_SERVIDOR_DEFECTO);
  });

  it("guardarServidorUrl persiste la URL del servidor", async () => {
    await guardarServidorUrl(ejecutor, "http://192.168.1.10:3000/api/v1");
    expect(await leerServidorUrl(ejecutor)).toBe("http://192.168.1.10:3000/api/v1");
  });
});
