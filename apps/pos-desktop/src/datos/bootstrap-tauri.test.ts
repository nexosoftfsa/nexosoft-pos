import { createRequire } from "node:module";

import { beforeEach, describe, expect, it } from "vitest";

import { crearRepositoriosSqlite, type RepositoriosSqlite } from "@nexosoft/app";
import { Cantidad, CondicionIva, FormaDePago, Money, TipoComprobante } from "@nexosoft/domain";

import {
  inicializarBaseTauri,
  leerCatalogo,
  leerConfig,
  sembrarSiVacio,
  ServicioDeVentaTransaccional,
} from "./bootstrap-tauri";
import { EjecutorSqlTauri, type BaseDatosSql } from "./ejecutor-sql-tauri";

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir("node:sqlite") as typeof import("node:sqlite");

/** `BaseDatosSql` sobre node:sqlite real; traduce `$N` (del ejecutor) de vuelta a `?`. */
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

async function montar(): Promise<{ ejecutor: EjecutorSqlTauri; repos: RepositoriosSqlite }> {
  const ejecutor = await EjecutorSqlTauri.abrir("sqlite:test.db", async () => crearBaseNodeSqlite());
  await inicializarBaseTauri(ejecutor);
  const repos = crearRepositoriosSqlite(ejecutor);
  await sembrarSiVacio(ejecutor, repos);
  return { ejecutor, repos };
}

describe("bootstrap-tauri — siembra", () => {
  it("siembra config + catálogo demo en una base vacía", async () => {
    const { ejecutor } = await montar();

    const arts = await ejecutor.consultar<{ n: number }>("SELECT COUNT(*) AS n FROM articulo");
    expect(Number(arts[0]?.n)).toBe(8);

    const config = await leerConfig(ejecutor);
    expect(config.cuit).toBe("30-71234567-8");
    expect(config.condicionIvaEmisor).toBe(CondicionIva.ResponsableInscripto);
    expect(config.depositoPorDefectoId).toBe("principal");
  });

  it("es idempotente: sembrar de nuevo no duplica artículos", async () => {
    const { ejecutor, repos } = await montar();
    await sembrarSiVacio(ejecutor, repos); // segunda corrida

    const arts = await ejecutor.consultar<{ n: number }>("SELECT COUNT(*) AS n FROM articulo");
    expect(Number(arts[0]?.n)).toBe(8);
  });
});

describe("bootstrap-tauri — leerCatalogo", () => {
  it("devuelve el catálogo con el precio final resuelto", async () => {
    const { ejecutor, repos } = await montar();
    const config = await leerConfig(ejecutor);

    const catalogo = await leerCatalogo(ejecutor, repos, config);
    expect(catalogo).toHaveLength(8);

    const gaseosa = catalogo.find((p) => p.articulo.id === "gaseosa");
    expect(gaseosa?.precioFinal.aDecimalString()).toBe("1850.00");
  });
});

describe("bootstrap-tauri — ServicioDeVentaTransaccional", () => {
  let ejecutor: EjecutorSqlTauri;
  let repos: RepositoriosSqlite;

  beforeEach(async () => {
    ({ ejecutor, repos } = await montar());
  });

  it("confirma la venta dentro de una transacción y descuenta el stock", async () => {
    const config = await leerConfig(ejecutor);
    const servicio = new ServicioDeVentaTransaccional(ejecutor, config, repos);

    const venta = await servicio.confirmarVenta({
      items: [{ articuloId: "gaseosa", cantidad: Cantidad.de("2") }],
      condicionReceptor: CondicionIva.ConsumidorFinal,
      pagos: [{ forma: FormaDePago.Efectivo, monto: Money.desde("5000") }],
    });

    expect(venta.tipoComprobante).toBe(TipoComprobante.FacturaB);

    const ventas = await ejecutor.consultar<{ n: number }>("SELECT COUNT(*) AS n FROM venta");
    expect(Number(ventas[0]?.n)).toBe(1);

    // Gaseosa: stock demo 40 → 38, persistido.
    const existencia = await repos.existencias.obtener("gaseosa", config.depositoPorDefectoId);
    expect(existencia?.cantidad.aDecimalString(0)).toBe("38");
  });
});
