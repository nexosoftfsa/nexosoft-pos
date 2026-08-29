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
    expect(r).toEqual({ productos: 1, stockInicializado: 1, dadosDeBaja: 0 });

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

  describe("bajas: lo que el servidor ya no tiene deja de venderse", () => {
    /** Los artículos que el POS deja ver y vender. */
    async function vendibles(): Promise<string[]> {
      const filas = await ejecutor.consultar<{ id: string }>(
        "SELECT id FROM articulo WHERE activo = 1 ORDER BY id",
      );
      return filas.map((f) => f.id);
    }

    it("da de baja el catálogo viejo cuando el servidor trae otro", async () => {
      // Este es el caso que rompió de verdad: se reinstaló el servidor, quedó
      // con el catálogo demo, y el POS le sumó el suyo en vez de reemplazarlo.
      // Los artículos viejos seguían vendibles y cada venta rebotaba contra el
      // servidor con "Foreign key constraint violated".
      await sincronizarCatalogo(repos, clienteFalso([PROD], []), config);
      expect(await vendibles()).toEqual(["p1"]);

      const demo: ProductoRemoto = { ...PROD, id: "demo1", codigo: "D1", nombre: "Aceite" };
      const r = await sincronizarCatalogo(repos, clienteFalso([demo], []), config);

      expect(r.dadosDeBaja).toBe(1);
      expect(await vendibles()).toEqual(["demo1"]);
    });

    it("no borra el artículo: la venta local vieja lo sigue encontrando", async () => {
      // Se desactiva, no se borra: hay ventas locales y operaciones en la cola
      // que todavía lo referencian.
      await sincronizarCatalogo(repos, clienteFalso([PROD], []), config);
      await sincronizarCatalogo(repos, clienteFalso([{ ...PROD, id: "otro", codigo: "002" }], []), config);

      expect(await repos.articulos.obtener("p1")).toBeDefined();
      expect((await repos.articulos.obtener("p1"))?.activo).toBe(false);
    });

    it("un artículo que vuelve al servidor vuelve a venderse", async () => {
      await sincronizarCatalogo(repos, clienteFalso([PROD], []), config);
      await sincronizarCatalogo(repos, clienteFalso([{ ...PROD, id: "otro", codigo: "002" }], []), config);
      expect((await repos.articulos.obtener("p1"))?.activo).toBe(false);

      await sincronizarCatalogo(repos, clienteFalso([PROD], []), config);
      expect((await repos.articulos.obtener("p1"))?.activo).toBe(true);
    });

    it("un catálogo vacío NO deja al comercio sin nada que vender", async () => {
      // Si el servidor contesta vacío por un error o una base a medio migrar,
      // dar de baja todo dejaría la caja sin poder vender. Ante la duda, no se
      // toca nada.
      await sincronizarCatalogo(repos, clienteFalso([PROD], []), config);

      const r = await sincronizarCatalogo(repos, clienteFalso([], []), config);

      expect(r.dadosDeBaja).toBe(0);
      expect(await vendibles()).toEqual(["p1"]);
    });

    it("no toca nada cuando el catálogo no cambió", async () => {
      await sincronizarCatalogo(repos, clienteFalso([PROD], []), config);
      const r = await sincronizarCatalogo(repos, clienteFalso([PROD], []), config);

      expect(r.dadosDeBaja).toBe(0);
      expect(await vendibles()).toEqual(["p1"]);
    });
  });

  it("un combo persiste sus componentes y NO crea existencia propia (Fase 8.1.b)", async () => {
    const combo: ProductoRemoto = {
      id: "combo1",
      codigo: "COMBO1",
      nombre: "Combo Merienda",
      descripcion: null,
      precioVenta: "2500.00",
      precioCosto: "1500.00",
      tipoIva: "IVA_21",
      activo: true,
      tipo: "COMBO",
      componentes: [
        { componenteId: "p1", cantidad: "1" },
        { componenteId: "p2", cantidad: "2" },
      ],
    };
    const prod2: ProductoRemoto = { ...PROD, id: "p2", codigo: "002", nombre: "Alfajor" };
    const r = await sincronizarCatalogo(
      repos,
      clienteFalso(
        [PROD, prod2, combo],
        [
          { producto: { id: "p1" }, saldo: "10" },
          { producto: { id: "p2" }, saldo: "20" },
        ],
      ),
      config,
      { reemplazarStock: true },
    );
    // Se procesan 3 productos; el combo no inicializa existencia (solo p1 y p2).
    expect(r).toEqual({ productos: 3, stockInicializado: 2, dadosDeBaja: 0 });

    const comps = await repos.combos.componentesDe("combo1");
    expect(comps.map((c) => [c.articuloId, c.cantidad.aDecimalString(0)])).toEqual([
      ["p1", "1"],
      ["p2", "2"],
    ]);
    // El combo se guardó como artículo pero sin existencia.
    expect(await repos.articulos.obtener("combo1")).toBeDefined();
    expect(await repos.existencias.obtener("combo1", config.depositoPorDefectoId)).toBeUndefined();
  });
});
