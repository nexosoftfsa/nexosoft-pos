import { describe, expect, it } from "vitest";

import {
  ALICUOTAS_IVA,
  Cantidad,
  CondicionIva,
  crearArticulo,
  crearExistencia,
  ErrorFiscal,
  EstadoCae,
  FormaDePago,
  ModoPrecio,
  Money,
  TipoComprobante,
  UnidadDeMedida,
  type LineaVenta,
  type PrecioArticulo,
} from "@nexosoft/domain";
import { MockServicioFiscal } from "@nexosoft/fiscal";

import type { ConfiguracionComercio } from "../config/configuracion-comercio.js";
import { crearRepositoriosMemoria } from "../memoria/repositorios-memoria.js";
import { ServicioDeFacturacion } from "./servicio-facturacion.js";
import { ServicioDeVenta } from "./servicio-venta.js";
import type { VentaConfirmada } from "./venta.js";

function montar(opciones: { forzarRechazo?: boolean } = {}) {
  const articulo = crearArticulo({
    id: "art",
    codigoInterno: "G1",
    descripcion: "Gaseosa",
    unidadDeMedida: UnidadDeMedida.Unidad,
    costoNeto: Money.desde("500"),
    alicuotaIva: ALICUOTAS_IVA.VEINTIUNO,
  });
  const precio: PrecioArticulo = {
    articuloId: "art",
    listaId: "LISTA",
    modo: ModoPrecio.Manual,
    precioManual: Money.desde("1210.00"),
  };
  const repos = crearRepositoriosMemoria({
    articulos: [articulo],
    precios: [precio],
    existencias: [
      crearExistencia({ articuloId: "art", depositoId: "DEP", cantidad: Cantidad.de("50") }),
    ],
  });
  const config: ConfiguracionComercio = {
    cuit: "30-71234567-8",
    razonSocial: "Comercio de prueba",
    condicionIvaEmisor: CondicionIva.ResponsableInscripto,
    puntoDeVenta: 1,
    depositoPorDefectoId: "DEP",
    listaPredeterminadaId: "LISTA",
    preciosIncluyenIva: true,
    permitirStockNegativo: false,
  };
  const fiscal = new MockServicioFiscal(
    opciones.forzarRechazo === true ? { forzarRechazo: true } : {},
  );
  return {
    repos,
    config,
    venta: new ServicioDeVenta(repos, config),
    facturacion: new ServicioDeFacturacion(repos, config, fiscal),
  };
}

async function venderUna(ctx: ReturnType<typeof montar>): Promise<VentaConfirmada> {
  return ctx.venta.confirmarVenta({
    items: [{ articuloId: "art", cantidad: Cantidad.de("1") }],
    condicionReceptor: CondicionIva.ConsumidorFinal,
    pagos: [{ forma: FormaDePago.Efectivo, monto: Money.desde("1210") }],
  });
}

describe("ServicioDeFacturacion — autorizar", () => {
  it("una venta pendiente pasa a AUTORIZADA con CAE", async () => {
    const ctx = montar();
    const venta = await venderUna(ctx);
    expect(venta.estadoCae).toBe(EstadoCae.PendienteCae);

    const autorizada = await ctx.facturacion.autorizar(venta);
    expect(autorizada.estadoCae).toBe(EstadoCae.Autorizada);
    expect(autorizada.cae).toMatch(/^\d{14}$/);
    expect(autorizada.vencimientoCae).toBeInstanceOf(Date);

    // Persistido.
    expect(ctx.repos.ventas.ventas[0]?.estadoCae).toBe(EstadoCae.Autorizada);
  });

  it("si ARCA rechaza, queda RECHAZADA", async () => {
    const ctx = montar({ forzarRechazo: true });
    const venta = await venderUna(ctx);
    const r = await ctx.facturacion.autorizar(venta);
    expect(r.estadoCae).toBe(EstadoCae.Rechazada);
    expect(r.cae).toBeUndefined();
  });

  it("no se puede autorizar dos veces", async () => {
    const ctx = montar();
    const venta = await venderUna(ctx);
    await ctx.facturacion.autorizar(venta);
    const autorizada = ctx.repos.ventas.ventas[0];
    await expect(ctx.facturacion.autorizar(autorizada as VentaConfirmada)).rejects.toBeInstanceOf(
      ErrorFiscal,
    );
  });
});

describe("ServicioDeFacturacion — Nota de Crédito", () => {
  it("anula una venta: NC de la misma letra, asociada y autorizable", async () => {
    const ctx = montar();
    const venta = await venderUna(ctx);
    await ctx.facturacion.autorizar(venta);

    const nc = await ctx.facturacion.emitirNotaCredito(venta);
    expect(nc.tipoComprobante).toBe(TipoComprobante.NotaCreditoB);
    expect(nc.estadoCae).toBe(EstadoCae.PendienteCae);
    expect(nc.resultado.total.aDecimalString()).toBe("1210.00");
    expect(nc.comprobantesAsociados?.[0]).toEqual({
      tipo: TipoComprobante.FacturaB,
      puntoDeVenta: 1,
      numero: venta.numero,
    });

    const ncAutorizada = await ctx.facturacion.autorizar(nc);
    expect(ncAutorizada.estadoCae).toBe(EstadoCae.Autorizada);
    expect(ncAutorizada.cae).toMatch(/^\d{14}$/);
  });
});

describe("ServicioDeFacturacion — Nota de Débito", () => {
  it("emite ND por un cargo adicional, asociada a la factura", async () => {
    const ctx = montar();
    const venta = await venderUna(ctx);
    await ctx.facturacion.autorizar(venta);

    const cargo: LineaVenta[] = [
      {
        descripcion: "Interés por pago fuera de término",
        cantidad: 1,
        precioUnitario: Money.desde("121.00"),
        alicuota: ALICUOTAS_IVA.VEINTIUNO,
      },
    ];
    const nd = await ctx.facturacion.emitirNotaDebito(venta, cargo);
    expect(nd.tipoComprobante).toBe(TipoComprobante.NotaDebitoB);
    expect(nd.resultado.total.aDecimalString()).toBe("121.00");
    expect(nd.comprobantesAsociados?.[0]?.numero).toBe(venta.numero);

    const autorizada = await ctx.facturacion.autorizar(nd);
    expect(autorizada.estadoCae).toBe(EstadoCae.Autorizada);
  });

  it("rechaza una ND sin conceptos", async () => {
    const ctx = montar();
    const venta = await venderUna(ctx);
    await expect(ctx.facturacion.emitirNotaDebito(venta, [])).rejects.toThrow(/concepto/i);
  });
});
