import { createRequire } from "node:module";

import { beforeEach, describe, expect, it } from "vitest";

import type { EjecutorSql, Fila, ValorSql } from "@nexosoft/app";
import type { OperacionSync } from "@nexosoft/sync";

import { AlmacenSqlite, crearTablaSync } from "./almacen-sqlite";

// node:sqlite vía require para que Vite no intente resolverlo en build.
const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir("node:sqlite") as typeof import("node:sqlite");
type DBSync = InstanceType<typeof DatabaseSync>;

class EjecutorNodeSqlite implements EjecutorSql {
  constructor(private readonly db: DBSync) {}
  async ejecutar(sql: string, params: readonly ValorSql[] = []): Promise<void> {
    if (params.length === 0) this.db.exec(sql);
    else this.db.prepare(sql).run(...params);
  }
  async consultar<T extends Fila = Fila>(sql: string, params: readonly ValorSql[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...params) as unknown as T[];
  }
}

function op(operacionId: string, creadaEn = "2026-06-26T10:00:00.000Z"): OperacionSync {
  return {
    operacionId,
    tipo: "venta",
    payload: { medioPago: "EFECTIVO", items: [{ productoId: "p1", cantidad: "2", precioUnitario: "100" }] },
    terminalId: "caja-1",
    creadaEn,
  };
}

describe("AlmacenSqlite", () => {
  let almacen: AlmacenSqlite;

  beforeEach(async () => {
    const db = new DatabaseSync(":memory:");
    const ejecutor = new EjecutorNodeSqlite(db);
    await crearTablaSync(ejecutor);
    almacen = new AlmacenSqlite(ejecutor);
  });

  it("encola una operación como pendiente y preserva el payload (JSON round-trip)", async () => {
    await almacen.encolar(op("op-1"));

    const o = await almacen.obtener("op-1");
    expect(o?.estado).toBe("pendiente");
    expect(o?.intentos).toBe(0);
    expect(o?.terminalId).toBe("caja-1");
    expect((o?.payload as { medioPago: string }).medioPago).toBe("EFECTIVO");
  });

  it("es idempotente: encolar el mismo operacionId no duplica ni pisa", async () => {
    await almacen.encolar(op("op-1"));
    await almacen.marcar("op-1", "completada");
    await almacen.encolar(op("op-1")); // reintento de encolar

    const todas = await almacen.todas();
    expect(todas).toHaveLength(1);
    expect(todas[0]?.estado).toBe("completada"); // no se reseteó a pendiente
  });

  it("pendientes() respeta orden por fecha y el límite", async () => {
    await almacen.encolar(op("op-1", "2026-06-26T10:00:00.000Z"));
    await almacen.encolar(op("op-2", "2026-06-26T11:00:00.000Z"));
    await almacen.encolar(op("op-3", "2026-06-26T12:00:00.000Z"));

    const dos = await almacen.pendientes(2);
    expect(dos.map((o) => o.operacionId)).toEqual(["op-1", "op-2"]);
  });

  it("marcar() actualiza estado, intentos y último error", async () => {
    await almacen.encolar(op("op-1"));
    await almacen.marcar("op-1", "fallida", { intentos: 3, ultimoError: "timeout" });

    const o = await almacen.obtener("op-1");
    expect(o?.estado).toBe("fallida");
    expect(o?.intentos).toBe(3);
    expect(o?.ultimoError).toBe("timeout");
  });

  it("marcar() sin datos preserva intentos previos (COALESCE)", async () => {
    await almacen.encolar(op("op-1"));
    await almacen.marcar("op-1", "pendiente", { intentos: 2 });
    await almacen.marcar("op-1", "enviando"); // sin tocar intentos

    const o = await almacen.obtener("op-1");
    expect(o?.intentos).toBe(2);
    expect(o?.estado).toBe("enviando");
  });

  it("las completadas no aparecen en pendientes()", async () => {
    await almacen.encolar(op("op-1"));
    await almacen.encolar(op("op-2"));
    await almacen.marcar("op-1", "completada");

    const pend = await almacen.pendientes();
    expect(pend.map((o) => o.operacionId)).toEqual(["op-2"]);
  });

  describe("reintentarFallidas", () => {
    it("vuelve a pendiente las fallidas, resetea intentos y limpia el error", async () => {
      await almacen.encolar(op("op-1"));
      await almacen.encolar(op("op-2"));
      await almacen.marcar("op-1", "fallida", { intentos: 5, ultimoError: "Sync HTTP 401" });
      await almacen.marcar("op-2", "completada");

      const n = await almacen.reintentarFallidas();

      expect(n).toBe(1);
      const o1 = await almacen.obtener("op-1");
      expect(o1?.estado).toBe("pendiente");
      expect(o1?.intentos).toBe(0);
      expect(o1?.ultimoError).toBeUndefined();
      const o2 = await almacen.obtener("op-2");
      expect(o2?.estado).toBe("completada"); // no la toca
    });

    it("devuelve 0 sin tocar nada si no hay fallidas", async () => {
      await almacen.encolar(op("op-1"));
      const n = await almacen.reintentarFallidas();
      expect(n).toBe(0);
      expect((await almacen.obtener("op-1"))?.estado).toBe("pendiente");
    });
  });
});
