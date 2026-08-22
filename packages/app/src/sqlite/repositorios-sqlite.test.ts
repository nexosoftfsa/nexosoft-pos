import { createRequire } from "node:module";

import { beforeEach, describe, expect, it } from "vitest";

import {
  ALICUOTAS_IVA,
  Cantidad,
  CondicionIva,
  crearArticulo,
  crearDeposito,
  crearExistencia,
  crearListaDePrecios,
  EstadoCae,
  FormaDePago,
  ModoPrecio,
  Money,
  TipoComprobante,
  TipoLista,
  UnidadDeMedida,
  type PrecioArticulo,
} from "@nexosoft/domain";
import { MockServicioFiscal } from "@nexosoft/fiscal";

import type { ConfiguracionComercio } from "../config/configuracion-comercio.js";
import { ServicioDeFacturacion } from "../ventas/servicio-facturacion.js";
import { ServicioDeVenta } from "../ventas/servicio-venta.js";
import type { EjecutorSql, Fila, ValorSql } from "./ejecutor-sql.js";
import { crearEsquema } from "./esquema.js";
import { crearRepositoriosSqlite, guardarDeposito, guardarLista } from "./repositorios-sqlite.js";

// Cargamos node:sqlite en runtime (vía require) para que Vite no intente
// resolverlo en build: vite@5 todavía no lo reconoce como módulo nativo.
const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir("node:sqlite") as typeof import("node:sqlite");
type DBSync = InstanceType<typeof DatabaseSync>;

/** EjecutorSql sobre node:sqlite (SQLite real en memoria) para los tests. */
class EjecutorNodeSqlite implements EjecutorSql {
  constructor(private readonly db: DBSync) {}
  async ejecutar(sql: string, params: readonly ValorSql[] = []): Promise<void> {
    if (params.length === 0) this.db.exec(sql);
    else this.db.prepare(sql).run(...params);
  }
  async consultar<T extends Fila = Fila>(
    sql: string,
    params: readonly ValorSql[] = [],
  ): Promise<T[]> {
    return this.db.prepare(sql).all(...params) as unknown as T[];
  }
}

const DEP = "DEP";
const LISTA = "LISTA";

async function montar(stock = "10") {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const ejecutor = new EjecutorNodeSqlite(db);
  await crearEsquema(ejecutor);

  const repos = crearRepositoriosSqlite(ejecutor);
  await guardarDeposito(ejecutor, crearDeposito({ id: DEP, nombre: "Central" }));
  await guardarLista(
    ejecutor,
    crearListaDePrecios({ id: LISTA, nombre: "Minorista", tipo: TipoLista.Minorista }),
  );
  const articulo = crearArticulo({
    id: "art",
    codigoInterno: "G1",
    descripcion: "Gaseosa",
    unidadDeMedida: UnidadDeMedida.Unidad,
    costoNeto: Money.desde("500"),
    alicuotaIva: ALICUOTAS_IVA.VEINTIUNO,
  });
  await repos.articulos.guardar(articulo);
  const precio: PrecioArticulo = {
    articuloId: "art",
    listaId: LISTA,
    modo: ModoPrecio.Manual,
    precioManual: Money.desde("1210.00"),
  };
  await repos.precios.guardar(precio);
  await repos.existencias.guardar(
    crearExistencia({ articuloId: "art", depositoId: DEP, cantidad: Cantidad.de(stock) }),
  );

  const config: ConfiguracionComercio = {
    cuit: "20-12345678-9",
    razonSocial: "Comercio de prueba",
    condicionIvaEmisor: CondicionIva.ResponsableInscripto,
    puntoDeVenta: 1,
    depositoPorDefectoId: DEP,
    listaPredeterminadaId: LISTA,
    preciosIncluyenIva: true,
    permitirStockNegativo: false,
  };
  return {
    db,
    ejecutor,
    repos,
    config,
    servicio: new ServicioDeVenta(repos, config),
    facturacion: new ServicioDeFacturacion(repos, config, new MockServicioFiscal()),
  };
}

const efectivo = (m: string) => ({ forma: FormaDePago.Efectivo, monto: Money.desde(m) });

describe("Adaptador SQLite — round-trip de catálogo", () => {
  it("relee un artículo con su dinero, alícuota y unidad", async () => {
    const { repos } = await montar();
    const a = await repos.articulos.obtener("art");
    expect(a?.descripcion).toBe("Gaseosa");
    expect(a?.costoNeto.aDecimalString()).toBe("500.00");
    expect(a?.alicuotaIva.porcentaje).toBe(21);
    expect(a?.unidadDeMedida).toBe(UnidadDeMedida.Unidad);
  });

  it("nace sin grilla rápida y se puede marcar/desmarcar en forma local (Fase 17)", async () => {
    const { repos } = await montar();
    expect((await repos.articulos.obtener("art"))?.mostrarEnGrillaRapida).toBe(false);

    await repos.articulos.establecerGrillaRapida("art", true);
    expect((await repos.articulos.obtener("art"))?.mostrarEnGrillaRapida).toBe(true);

    await repos.articulos.establecerGrillaRapida("art", false);
    expect((await repos.articulos.obtener("art"))?.mostrarEnGrillaRapida).toBe(false);
  });

  it("guardar() (upsert de sync) no pisa la marca local de grilla rápida", async () => {
    const { repos } = await montar();
    await repos.articulos.establecerGrillaRapida("art", true);

    const articuloActualizado = crearArticulo({
      id: "art",
      codigoInterno: "G1",
      descripcion: "Gaseosa 1.5L",
      unidadDeMedida: UnidadDeMedida.Unidad,
      costoNeto: Money.desde("550"),
      alicuotaIva: ALICUOTAS_IVA.VEINTIUNO,
    });
    await repos.articulos.guardar(articuloActualizado);

    const a = await repos.articulos.obtener("art");
    expect(a?.descripcion).toBe("Gaseosa 1.5L");
    expect(a?.mostrarEnGrillaRapida).toBe(true);
  });
});

describe("Adaptador SQLite — combos (Fase 8.1.b)", () => {
  it("guarda y relee los componentes de un combo; vender descuenta cada uno", async () => {
    const { ejecutor, repos, servicio } = await montar();

    // Un segundo artículo simple + el combo (café ya existe como "art").
    await repos.articulos.guardar(
      crearArticulo({
        id: "alfajor",
        codigoInterno: "A1",
        descripcion: "Alfajor",
        unidadDeMedida: UnidadDeMedida.Unidad,
        costoNeto: Money.desde("300"),
        alicuotaIva: ALICUOTAS_IVA.VEINTIUNO,
      }),
    );
    await repos.existencias.guardar(
      crearExistencia({ articuloId: "alfajor", depositoId: DEP, cantidad: Cantidad.de("10") }),
    );
    await repos.articulos.guardar(
      crearArticulo({
        id: "combo",
        codigoInterno: "K1",
        descripcion: "Combo",
        unidadDeMedida: UnidadDeMedida.Unidad,
        costoNeto: Money.desde("700"),
        alicuotaIva: ALICUOTAS_IVA.VEINTIUNO,
      }),
    );
    await repos.precios.guardar({
      articuloId: "combo",
      listaId: LISTA,
      modo: ModoPrecio.Manual,
      precioManual: Money.desde("2000.00"),
    });
    await repos.combos.reemplazar("combo", [
      { articuloId: "art", cantidad: Cantidad.de("1") },
      { articuloId: "alfajor", cantidad: Cantidad.de("3") },
    ]);

    // Relectura del puerto (orden determinista por componente_id).
    const comps = await repos.combos.componentesDe("combo");
    expect(comps.map((c) => [c.articuloId, c.cantidad.aDecimalString(0)])).toEqual([
      ["alfajor", "3"],
      ["art", "1"],
    ]);

    await servicio.confirmarVenta({
      items: [{ articuloId: "combo", cantidad: Cantidad.de("2") }],
      condicionReceptor: CondicionIva.ConsumidorFinal,
      pagos: [efectivo("4000")],
    });

    // art 10 − (2×1) = 8; alfajor 10 − (2×3) = 4.
    const art = await repos.existencias.obtener("art", DEP);
    const alfajor = await repos.existencias.obtener("alfajor", DEP);
    expect(art?.cantidad.aDecimalString(0)).toBe("8");
    expect(alfajor?.cantidad.aDecimalString(0)).toBe("4");

    const movs = await ejecutor.consultar("SELECT * FROM movimiento_stock WHERE tipo='venta'");
    expect(movs).toHaveLength(2);
  });
});

describe("Adaptador SQLite — ServicioDeVenta persiste de verdad", () => {
  let ctx: Awaited<ReturnType<typeof montar>>;
  beforeEach(async () => {
    ctx = await montar();
  });

  it("confirmarVenta guarda venta, ítems, pagos y descuenta stock", async () => {
    const venta = await ctx.servicio.confirmarVenta({
      items: [{ articuloId: "art", cantidad: Cantidad.de("2") }],
      condicionReceptor: CondicionIva.ConsumidorFinal,
      pagos: [efectivo("3000")],
    });

    expect(venta.tipoComprobante).toBe(TipoComprobante.FacturaB);
    expect(venta.estadoCae).toBe(EstadoCae.PendienteCae);

    const ventas = await ctx.ejecutor.consultar("SELECT * FROM venta");
    expect(ventas).toHaveLength(1);
    expect(Number(ventas[0]?.total_cent)).toBe(242000);
    expect(Number(ventas[0]?.vuelto_cent)).toBe(58000);

    const items = await ctx.ejecutor.consultar("SELECT * FROM item_venta");
    expect(items).toHaveLength(1);
    expect(Number(items[0]?.importe_cent)).toBe(242000);
    expect(Number(items[0]?.costo_neto_cent)).toBe(50000); // costoNeto del articulo "art" (500.00), snapshot ADR-0048

    const pagos = await ctx.ejecutor.consultar("SELECT * FROM pago");
    expect(pagos).toHaveLength(1);

    const movs = await ctx.ejecutor.consultar("SELECT * FROM movimiento_stock WHERE tipo='venta'");
    expect(movs).toHaveLength(1);

    // Stock 10 → 8, persistido.
    const e = await ctx.repos.existencias.obtener("art", DEP);
    expect(e?.cantidad.aDecimalString(0)).toBe("8");
  });

  it("autorizar persiste el CAE en la base", async () => {
    const venta = await ctx.servicio.confirmarVenta({
      items: [{ articuloId: "art", cantidad: Cantidad.de("1") }],
      condicionReceptor: CondicionIva.ConsumidorFinal,
      pagos: [efectivo("1210")],
    });
    const autorizada = await ctx.facturacion.autorizar(venta);
    expect(autorizada.estadoCae).toBe(EstadoCae.Autorizada);

    const filas = await ctx.ejecutor.consultar("SELECT estado_cae, cae FROM venta WHERE id = ?", [
      venta.id,
    ]);
    expect(filas[0]?.estado_cae).toBe("AUTORIZADA");
    expect(String(filas[0]?.cae)).toMatch(/^\d{14}$/);
  });

  it("la numeración correlativa se deriva de la base", async () => {
    const v1 = await ctx.servicio.confirmarVenta({
      items: [{ articuloId: "art", cantidad: Cantidad.de("1") }],
      condicionReceptor: CondicionIva.ConsumidorFinal,
      pagos: [efectivo("1210")],
    });
    const v2 = await ctx.servicio.confirmarVenta({
      items: [{ articuloId: "art", cantidad: Cantidad.de("1") }],
      condicionReceptor: CondicionIva.ConsumidorFinal,
      pagos: [efectivo("1210")],
    });
    expect([v1.numero, v2.numero]).toEqual([1, 2]);
  });

  it("respeta el UNIQUE de numeración (no duplica número por PV+tipo)", async () => {
    await ctx.servicio.confirmarVenta({
      items: [{ articuloId: "art", cantidad: Cantidad.de("1") }],
      condicionReceptor: CondicionIva.ConsumidorFinal,
      pagos: [efectivo("1210")],
    });
    const filas = await ctx.ejecutor.consultar(
      "SELECT COUNT(*) AS n FROM venta WHERE punto_de_venta = 1",
    );
    expect(Number(filas[0]?.n)).toBe(1);
  });
});
