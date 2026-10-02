import { createRequire } from "node:module";

import { beforeEach, describe, expect, it } from "vitest";

import { crearRepositoriosSqlite, type RepositoriosSqlite } from "@nexosoft/app";
import { Cantidad, CondicionIva, FormaDePago, Money, TipoComprobante } from "@nexosoft/domain";

import {
  guardarConfig,
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
  const ejecutor = await EjecutorSqlTauri.abrir("sqlite:test.db", async () =>
    crearBaseNodeSqlite(),
  );
  await inicializarBaseTauri(ejecutor);
  const repos = crearRepositoriosSqlite(ejecutor);
  await sembrarSiVacio(ejecutor, repos);
  return { ejecutor, repos };
}

describe("bootstrap-tauri — siembra", () => {
  it("siembra config + catálogo demo en una base vacía", async () => {
    const { ejecutor } = await montar();

    const arts = await ejecutor.consultar<{ n: number }>("SELECT COUNT(*) AS n FROM articulo");
    expect(Number(arts[0]?.n)).toBe(711);

    const config = await leerConfig(ejecutor);
    expect(config.cuit).toBe("30-71234567-8");
    expect(config.condicionIvaEmisor).toBe(CondicionIva.ResponsableInscripto);
    expect(config.depositoPorDefectoId).toBe("principal");
    // Fase 10.1: por defecto el comercio ya emite comprobantes fiscales.
    expect(config.emiteComprobantesFiscales).toBe(true);
  });

  it("guardarConfig persiste emiteComprobantesFiscales=false y leerConfig lo respeta (Fase 10.1)", async () => {
    const { ejecutor } = await montar();
    const actual = await leerConfig(ejecutor);
    await guardarConfig(ejecutor, { ...actual, emiteComprobantesFiscales: false });

    const releida = await leerConfig(ejecutor);
    expect(releida.emiteComprobantesFiscales).toBe(false);
  });

  describe("datos del emisor que pide la RG 1415 (Fase 20)", () => {
    it("guardarConfig los persiste y leerConfig los devuelve", async () => {
      const { ejecutor } = await montar();
      const actual = await leerConfig(ejecutor);

      await guardarConfig(ejecutor, {
        ...actual,
        domicilioComercial: "Av. Siempreviva 742",
        ingresosBrutos: "901-123456-7",
        inicioActividades: "2019-03-15",
      });

      const releida = await leerConfig(ejecutor);
      expect(releida.domicilioComercial).toBe("Av. Siempreviva 742");
      expect(releida.ingresosBrutos).toBe("901-123456-7");
      expect(releida.inicioActividades).toBe("2019-03-15");
    });

    it("una base recién sembrada no los tiene, y eso no rompe nada", async () => {
      // Es el caso de toda instalación anterior a la Fase 20: la columna
      // aparece con el ALTER TABLE, vacía, hasta que alguien entre a
      // Configuración.
      const { ejecutor } = await montar();
      const config = await leerConfig(ejecutor);

      expect(config.domicilioComercial).toBeUndefined();
      expect(config.ingresosBrutos).toBeUndefined();
      expect(config.inicioActividades).toBeUndefined();
    });

    it("un campo vaciado vuelve a ser ausente, no una cadena vacía", async () => {
      const { ejecutor } = await montar();
      const actual = await leerConfig(ejecutor);
      await guardarConfig(ejecutor, { ...actual, domicilioComercial: "   " });

      expect((await leerConfig(ejecutor)).domicilioComercial).toBeUndefined();
    });
  });

  it("es idempotente: sembrar de nuevo no duplica artículos", async () => {
    const { ejecutor, repos } = await montar();
    await sembrarSiVacio(ejecutor, repos); // segunda corrida

    const arts = await ejecutor.consultar<{ n: number }>("SELECT COUNT(*) AS n FROM articulo");
    expect(Number(arts[0]?.n)).toBe(711);
  });
});

describe("bootstrap-tauri — leerCatalogo", () => {
  it("devuelve el catálogo con el precio final resuelto", async () => {
    const { ejecutor, repos } = await montar();
    const config = await leerConfig(ejecutor);

    const catalogo = await leerCatalogo(ejecutor, repos, config);
    expect(catalogo).toHaveLength(711);

    const gaseosa = catalogo.find((p) => p.articulo.id === "gaseosa");
    expect(gaseosa?.precioFinal.aDecimalString()).toBe("3200.00");
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
      pagos: [{ forma: FormaDePago.Efectivo, monto: Money.desde("7000") }],
    });

    expect(venta.tipoComprobante).toBe(TipoComprobante.FacturaB);

    const ventas = await ejecutor.consultar<{ n: number }>("SELECT COUNT(*) AS n FROM venta");
    expect(Number(ventas[0]?.n)).toBe(1);

    // Gaseosa (Coca Cola Retornable 1.5L, catálogo real del cliente): stock 5 → 3, persistido.
    const existencia = await repos.existencias.obtener("gaseosa", config.depositoPorDefectoId);
    expect(existencia?.cantidad.aDecimalString(0)).toBe("3");
  });
});
