import { describe, expect, it } from "vitest";

import {
  ALICUOTAS_IVA,
  Cantidad,
  CondicionIva,
  crearArticulo,
  crearExistencia,
  EstadoCae,
  ErrorDominio,
  ErrorPago,
  ErrorStock,
  FormaDePago,
  ModoPrecio,
  Money,
  TipoComprobante,
  UnidadDeMedida,
  type PrecioArticulo,
} from "@nexosoft/domain";

import type { ConfiguracionComercio } from "../config/configuracion-comercio.js";
import { crearRepositoriosMemoria } from "../memoria/repositorios-memoria.js";
import { ServicioDeVenta } from "./servicio-venta.js";

interface OpcionesEscenario {
  condicionEmisor?: CondicionIva;
  permitirStockNegativo?: boolean;
  stock?: string;
  unidad?: (typeof UnidadDeMedida)[keyof typeof UnidadDeMedida];
  emiteComprobantesFiscales?: boolean;
}

function crearEscenario(opciones: OpcionesEscenario = {}) {
  const articulo = crearArticulo({
    id: "art",
    codigoInterno: "G1",
    descripcion: "Gaseosa",
    unidadDeMedida: opciones.unidad ?? UnidadDeMedida.Unidad,
    costoNeto: Money.desde("500"),
    alicuotaIva: ALICUOTAS_IVA.VEINTIUNO,
  });
  const precio: PrecioArticulo = {
    articuloId: "art",
    listaId: "LISTA",
    modo: ModoPrecio.Manual,
    precioManual: Money.desde("1210.00"),
  };
  const existencia = crearExistencia({
    articuloId: "art",
    depositoId: "DEP",
    cantidad: Cantidad.de(opciones.stock ?? "10"),
  });
  const repos = crearRepositoriosMemoria({
    articulos: [articulo],
    precios: [precio],
    existencias: [existencia],
  });
  const config: ConfiguracionComercio = {
    cuit: "20-12345678-9",
    razonSocial: "Comercio de prueba",
    condicionIvaEmisor: opciones.condicionEmisor ?? CondicionIva.ResponsableInscripto,
    puntoDeVenta: 1,
    depositoPorDefectoId: "DEP",
    listaPredeterminadaId: "LISTA",
    preciosIncluyenIva: true,
    permitirStockNegativo: opciones.permitirStockNegativo ?? false,
    ...(opciones.emiteComprobantesFiscales !== undefined
      ? { emiteComprobantesFiscales: opciones.emiteComprobantesFiscales }
      : {}),
  };
  return { repos, servicio: new ServicioDeVenta(repos, config) };
}

/**
 * Escenario con un COMBO ("combo") de 1×café + 2×alfajor. Café y alfajor tienen
 * stock propio; el combo no. Precio del combo: $5.000.
 */
function crearEscenarioCombo(opciones: { stockCafe?: string; stockAlfajor?: string } = {}) {
  const mkArt = (id: string, cod: string, desc: string, costo: string) =>
    crearArticulo({
      id,
      codigoInterno: cod,
      descripcion: desc,
      unidadDeMedida: UnidadDeMedida.Unidad,
      costoNeto: Money.desde(costo),
      alicuotaIva: ALICUOTAS_IVA.VEINTIUNO,
    });
  const mkPrecio = (articuloId: string, precio: string): PrecioArticulo => ({
    articuloId,
    listaId: "LISTA",
    modo: ModoPrecio.Manual,
    precioManual: Money.desde(precio),
  });
  const repos = crearRepositoriosMemoria({
    articulos: [
      mkArt("cafe", "C1", "Café", "2800"),
      mkArt("alfajor", "A1", "Alfajor", "700"),
      mkArt("combo", "K1", "Combo Merienda", "3500"),
    ],
    precios: [mkPrecio("cafe", "4300"), mkPrecio("alfajor", "1200"), mkPrecio("combo", "5000")],
    existencias: [
      crearExistencia({
        articuloId: "cafe",
        depositoId: "DEP",
        cantidad: Cantidad.de(opciones.stockCafe ?? "10"),
      }),
      crearExistencia({
        articuloId: "alfajor",
        depositoId: "DEP",
        cantidad: Cantidad.de(opciones.stockAlfajor ?? "10"),
      }),
    ],
    combos: new Map([
      [
        "combo",
        [
          { articuloId: "cafe", cantidad: Cantidad.de("1") },
          { articuloId: "alfajor", cantidad: Cantidad.de("2") },
        ],
      ],
    ]),
  });
  const config: ConfiguracionComercio = {
    cuit: "20-12345678-9",
    razonSocial: "Comercio de prueba",
    condicionIvaEmisor: CondicionIva.ResponsableInscripto,
    puntoDeVenta: 1,
    depositoPorDefectoId: "DEP",
    listaPredeterminadaId: "LISTA",
    preciosIncluyenIva: true,
    permitirStockNegativo: false,
  };
  return { repos, servicio: new ServicioDeVenta(repos, config) };
}

const efectivo = (m: string) => ({ forma: FormaDePago.Efectivo, monto: Money.desde(m) });

describe("ServicioDeVenta — confirmarVenta (camino feliz)", () => {
  it("emite Factura B, descuenta stock y da vuelto", async () => {
    const { repos, servicio } = crearEscenario();
    const venta = await servicio.confirmarVenta({
      items: [{ articuloId: "art", cantidad: Cantidad.de("2") }],
      condicionReceptor: CondicionIva.ConsumidorFinal,
      pagos: [efectivo("3000")],
    });

    expect(venta.tipoComprobante).toBe(TipoComprobante.FacturaB);
    expect(venta.numero).toBe(1);
    expect(venta.estadoCae).toBe(EstadoCae.PendienteCae);
    expect(venta.resultado.total.aDecimalString()).toBe("2420.00");
    expect(venta.vuelto.aDecimalString()).toBe("580.00");

    // Snapshot del costo del artículo al momento de la venta (ADR-0048).
    expect(venta.items[0]?.costoNeto.aDecimalString()).toBe("500.00");

    // Stock 10 → 8 y queda un movimiento de venta.
    const e = await repos.existencias.obtener("art", "DEP");
    expect(e?.cantidad.aDecimalString(0)).toBe("8");
    expect(repos.movimientos.movimientos).toHaveLength(1);
    expect(repos.ventas.ventas).toHaveLength(1);
  });

  it("con emiteComprobantesFiscales=false vende un TicketNoFiscal sin pedir CAE (Fase 10.1)", async () => {
    const { repos, servicio } = crearEscenario({ emiteComprobantesFiscales: false });
    const venta = await servicio.confirmarVenta({
      items: [{ articuloId: "art", cantidad: Cantidad.de("2") }],
      // Aunque se mande un receptor distinto, no influye: no hay resolución A/B/C.
      condicionReceptor: CondicionIva.ResponsableInscripto,
      pagos: [efectivo("3000")],
    });

    expect(venta.tipoComprobante).toBe(TipoComprobante.TicketNoFiscal);
    expect(venta.estadoCae).toBe(EstadoCae.Borrador);
    expect(venta.resultado.total.aDecimalString()).toBe("2420.00");
    // El stock se descuenta igual: es una venta real, solo que sin CAE.
    const e = await repos.existencias.obtener("art", "DEP");
    expect(e?.cantidad.aDecimalString(0)).toBe("8");
  });

  it("numera correlativamente por punto de venta y tipo", async () => {
    const { servicio } = crearEscenario();
    const v1 = await servicio.confirmarVenta({
      items: [{ articuloId: "art", cantidad: Cantidad.de("1") }],
      condicionReceptor: CondicionIva.ConsumidorFinal,
      pagos: [efectivo("1210")],
    });
    const v2 = await servicio.confirmarVenta({
      items: [{ articuloId: "art", cantidad: Cantidad.de("1") }],
      condicionReceptor: CondicionIva.ConsumidorFinal,
      pagos: [efectivo("1210")],
    });
    expect([v1.numero, v2.numero]).toEqual([1, 2]);
  });

  it("a un Responsable Inscripto emite Factura A", async () => {
    const { servicio } = crearEscenario();
    const venta = await servicio.confirmarVenta({
      items: [{ articuloId: "art", cantidad: Cantidad.de("1") }],
      condicionReceptor: CondicionIva.ResponsableInscripto,
      pagos: [efectivo("1210")],
    });
    expect(venta.tipoComprobante).toBe(TipoComprobante.FacturaA);
    expect(venta.resultado.discriminaIva).toBe(true);
  });

  it("un emisor Monotributo emite Factura C", async () => {
    const { servicio } = crearEscenario({ condicionEmisor: CondicionIva.Monotributo });
    const venta = await servicio.confirmarVenta({
      items: [{ articuloId: "art", cantidad: Cantidad.de("1") }],
      condicionReceptor: CondicionIva.ConsumidorFinal,
      pagos: [efectivo("1210")],
    });
    expect(venta.tipoComprobante).toBe(TipoComprobante.FacturaC);
    expect(venta.resultado.iva.esCero()).toBe(true);
  });

  it("acepta pago combinado (tarjeta + efectivo)", async () => {
    const { servicio } = crearEscenario();
    const venta = await servicio.confirmarVenta({
      items: [{ articuloId: "art", cantidad: Cantidad.de("2") }],
      condicionReceptor: CondicionIva.ConsumidorFinal,
      pagos: [{ forma: FormaDePago.Tarjeta, monto: Money.desde("1000") }, efectivo("1500")],
    });
    expect(venta.vuelto.aDecimalString()).toBe("80.00");
  });

  it("el recargo de tarjeta (Fase 12.E) se cobra encima del total sin tocar el comprobante fiscal", async () => {
    const { servicio } = crearEscenario();
    // Total del comprobante: 2 × 1210 = 2420 (sin cambios).
    const venta = await servicio.confirmarVenta({
      items: [{ articuloId: "art", cantidad: Cantidad.de("2") }],
      condicionReceptor: CondicionIva.ConsumidorFinal,
      pagos: [
        {
          forma: FormaDePago.Tarjeta,
          monto: Money.desde("1100"), // 1000 base + 100 de recargo
          tarjetaConfigId: "tar-1",
          cuotas: 6,
          recargoAplicado: Money.desde("100"),
        },
        efectivo("1500"),
      ],
    });
    // El comprobante fiscal NO incluye el recargo de tarjeta.
    expect(venta.resultado.total.aDecimalString()).toBe("2420.00");
    // Pero hay que cubrir 2420 + 100 = 2520; pagado = 1100 + 1500 = 2600 → vuelto 80.
    expect(venta.vuelto.aDecimalString()).toBe("80.00");
  });
});

describe("ServicioDeVenta — combos (Fase 8.1.b)", () => {
  it("vender un combo descuenta el stock de sus componentes, no del combo", async () => {
    const { repos, servicio } = crearEscenarioCombo();
    const venta = await servicio.confirmarVenta({
      items: [{ articuloId: "combo", cantidad: Cantidad.de("2") }],
      condicionReceptor: CondicionIva.ConsumidorFinal,
      pagos: [efectivo("10000")],
    });

    // La línea de la venta sigue siendo el combo (con su precio).
    expect(venta.items).toHaveLength(1);
    expect(venta.items[0]?.articuloId).toBe("combo");
    expect(venta.resultado.total.aDecimalString()).toBe("10000.00");

    // Stock: café 10 − (2×1) = 8; alfajor 10 − (2×2) = 6.
    const cafe = await repos.existencias.obtener("cafe", "DEP");
    const alfajor = await repos.existencias.obtener("alfajor", "DEP");
    expect(cafe?.cantidad.aDecimalString(0)).toBe("8");
    expect(alfajor?.cantidad.aDecimalString(0)).toBe("6");
    // El combo no tiene existencia propia.
    expect(await repos.existencias.obtener("combo", "DEP")).toBeUndefined();
    // Un movimiento de venta por componente.
    expect(repos.movimientos.movimientos).toHaveLength(2);
  });

  it("bloquea la venta del combo si falta stock de un componente", async () => {
    const { repos, servicio } = crearEscenarioCombo({ stockAlfajor: "1" });
    await expect(
      servicio.confirmarVenta({
        items: [{ articuloId: "combo", cantidad: Cantidad.de("1") }],
        condicionReceptor: CondicionIva.ConsumidorFinal,
        pagos: [efectivo("5000")],
      }),
    ).rejects.toBeInstanceOf(ErrorStock);
    // No se persistió nada: stock intacto.
    const cafe = await repos.existencias.obtener("cafe", "DEP");
    expect(cafe?.cantidad.aDecimalString(0)).toBe("10");
    expect(repos.ventas.ventas).toHaveLength(0);
  });
});

describe("ServicioDeVenta — previsualizarVenta no persiste", () => {
  it("devuelve totales sin tocar stock ni ventas", async () => {
    const { repos, servicio } = crearEscenario();
    const prev = await servicio.previsualizarVenta({
      items: [{ articuloId: "art", cantidad: Cantidad.de("2") }],
      condicionReceptor: CondicionIva.ConsumidorFinal,
      pagos: [efectivo("3000")],
    });
    expect(prev.resultado.total.aDecimalString()).toBe("2420.00");
    expect(prev.cobro.vuelto.aDecimalString()).toBe("580.00");

    const e = await repos.existencias.obtener("art", "DEP");
    expect(e?.cantidad.aDecimalString(0)).toBe("10"); // intacto
    expect(repos.ventas.ventas).toHaveLength(0);
  });
});

describe("ServicioDeVenta — validaciones", () => {
  it("bloquea la venta sin stock suficiente y no persiste nada", async () => {
    const { repos, servicio } = crearEscenario({ stock: "1" });
    await expect(
      servicio.confirmarVenta({
        items: [{ articuloId: "art", cantidad: Cantidad.de("5") }],
        condicionReceptor: CondicionIva.ConsumidorFinal,
        pagos: [efectivo("99999")],
      }),
    ).rejects.toBeInstanceOf(ErrorStock);
    const e = await repos.existencias.obtener("art", "DEP");
    expect(e?.cantidad.aDecimalString(0)).toBe("1");
    expect(repos.ventas.ventas).toHaveLength(0);
  });

  it("permite sobreventa si el comercio lo habilita", async () => {
    const { repos, servicio } = crearEscenario({ stock: "1", permitirStockNegativo: true });
    await servicio.confirmarVenta({
      items: [{ articuloId: "art", cantidad: Cantidad.de("5") }],
      condicionReceptor: CondicionIva.ConsumidorFinal,
      pagos: [efectivo("99999")],
    });
    const e = await repos.existencias.obtener("art", "DEP");
    expect(e?.cantidad.esNegativa()).toBe(true);
  });

  it("rechaza el pago que no cubre el total", async () => {
    const { servicio } = crearEscenario();
    await expect(
      servicio.confirmarVenta({
        items: [{ articuloId: "art", cantidad: Cantidad.de("2") }],
        condicionReceptor: CondicionIva.ConsumidorFinal,
        pagos: [efectivo("100")],
      }),
    ).rejects.toBeInstanceOf(ErrorPago);
  });

  it("rechaza cantidad fraccionada en un artículo por unidad", async () => {
    const { servicio } = crearEscenario({ unidad: UnidadDeMedida.Unidad });
    await expect(
      servicio.confirmarVenta({
        items: [{ articuloId: "art", cantidad: Cantidad.de("1.5") }],
        condicionReceptor: CondicionIva.ConsumidorFinal,
        pagos: [efectivo("9999")],
      }),
    ).rejects.toBeInstanceOf(ErrorDominio);
  });

  it("rechaza un artículo inexistente", async () => {
    const { servicio } = crearEscenario();
    await expect(
      servicio.confirmarVenta({
        items: [{ articuloId: "no-existe", cantidad: Cantidad.de("1") }],
        condicionReceptor: CondicionIva.ConsumidorFinal,
        pagos: [efectivo("9999")],
      }),
    ).rejects.toThrow(/no existe/i);
  });
});
