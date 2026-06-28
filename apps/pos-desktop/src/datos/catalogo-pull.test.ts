import { createRequire } from "node:module";

import { beforeEach, describe, expect, it } from "vitest";

import {
  crearEsquema,
  crearRepositoriosSqlite,
  type ConfiguracionComercio,
  type EjecutorSql,
  type Fila,
  type RepositoriosSqlite,
  type ValorSql,
} from "@nexosoft/app";
import { Cantidad, crearExistencia } from "@nexosoft/domain";

import { asegurarMaestros, leerConfig } from "./bootstrap-tauri";
import { sincronizarCatalogo } from "./catalogo-pull";
import type { ClienteCatalogo } from "../sync/cliente-catalogo-http";
import type { ProductoRemoto, SaldoRemoto } from "../sync/mapeo-catalogo";

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

/** Cliente de catálogo de prueba, con productos y saldos configurables. */
function clienteFalso(productos: ProductoRemoto[], saldos: SaldoRemoto[]): ClienteCatalogo {
  return {
    async descargarProductos() {
      return productos;
    },
    async descargarStock() {
      return saldos;
    },
  };
}

const PROD: ProductoRemoto = {
  id: "p1",
  codigo: "001",
  nombre: "Coca Cola",
  descripcion: null,
  precioVenta: "1000.00",
  precioCosto: "600.00",
  tipoIva: "IVA_21",
  activo: true,
};

describe("sincronizarCatalogo", () => {
  let ejecutor: EjecutorSql;
  let repos: RepositoriosSqlite;
  let config: ConfiguracionComercio;

  beforeEach(async () => {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    ejecutor = new EjecutorNodeSqlite(db);
    await crearEsquema(ejecutor);
    await asegurarMaestros(ejecutor);
    repos = crearRepositoriosSqlite(ejecutor);
    config = await leerConfig(ejecutor);
  });

  it("upsertea artículo + precio y deja el stock del servidor", async () => {
    const r = await sincronizarCatalogo(
      repos,
      clienteFalso([PROD], [{ producto: { id: "p1" }, saldo: "15" }]),
      config,
      { reemplazarStock: true },
    );
    expect(r).toEqual({ productos: 1, stockInicializado: 1 });

    const articulo = await repos.articulos.obtener("p1");
    expect(articulo?.codigoInterno).toBe("001");
    expect(articulo?.costoNeto.aDecimalString()).toBe("600.00");

    const precio = await repos.precios.obtener("p1", config.listaPredeterminadaId);
    expect(precio?.precioManual?.aDecimalString()).toBe("1000.00");

    const existencia = await repos.existencias.obtener("p1", config.depositoPorDefectoId);
    expect(existencia?.cantidad.aDecimalString(0)).toBe("15");
  });

  it("actualiza el precio (el servidor es la fuente de verdad del catálogo)", async () => {
    await sincronizarCatalogo(repos, clienteFalso([PROD], []), config);
    await sincronizarCatalogo(
      repos,
      clienteFalso([{ ...PROD, precioVenta: "1200.00" }], []),
      config,
    );

    const precio = await repos.precios.obtener("p1", config.listaPredeterminadaId);
    expect(precio?.precioManual?.aDecimalString()).toBe("1200.00");
  });

  it("sin reemplazarStock: respeta el stock local (ventas offline no sincronizadas)", async () => {
    // Aprovisionamiento inicial: stock 15 del servidor.
    await sincronizarCatalogo(repos, clienteFalso([PROD], [{ producto: { id: "p1" }, saldo: "15" }]), config, {
      reemplazarStock: true,
    });
    // Venta offline local: baja a 10.
    await repos.existencias.guardar(
      crearExistencia({ articuloId: "p1", depositoId: config.depositoPorDefectoId, cantidad: Cantidad.de("10") }),
    );

    // Pull de refresco con saldo del servidor 99: NO debe pisar el local.
    const r = await sincronizarCatalogo(
      repos,
      clienteFalso([PROD], [{ producto: { id: "p1" }, saldo: "99" }]),
      config,
    );
    expect(r.stockInicializado).toBe(0);

    const existencia = await repos.existencias.obtener("p1", config.depositoPorDefectoId);
    expect(existencia?.cantidad.aDecimalString(0)).toBe("10");
  });

  it("inicializa el stock de un artículo nuevo aunque no se reemplace", async () => {
    const r = await sincronizarCatalogo(
      repos,
      clienteFalso([PROD], [{ producto: { id: "p1" }, saldo: "7" }]),
      config,
    );
    expect(r.stockInicializado).toBe(1);

    const existencia = await repos.existencias.obtener("p1", config.depositoPorDefectoId);
    expect(existencia?.cantidad.aDecimalString(0)).toBe("7");
  });
});
