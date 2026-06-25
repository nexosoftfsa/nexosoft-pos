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

    // Stock 10 → 8 y queda un movimiento de venta.
    const e = await repos.existencias.obtener("art", "DEP");
    expect(e?.cantidad.aDecimalString(0)).toBe("8");
    expect(repos.movimientos.movimientos).toHaveLength(1);
    expect(repos.ventas.ventas).toHaveLength(1);
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
