import { describe, expect, it } from "vitest";

import {
  ALICUOTAS_IVA,
  calcularComprobante,
  CondicionIva,
  EstadoCae,
  Money,
  TipoComprobante,
} from "@nexosoft/domain";

import { MockServicioFiscal } from "./mock-servicio-fiscal.js";
import { construirSolicitudCae } from "./solicitud.js";
import { DocTipo, type SolicitudCae } from "./servicio-fiscal.js";

const FECHA = new Date("2026-06-25");

function solicitudValida(tipo: TipoComprobante, numero: number, precio = "1210"): SolicitudCae {
  const resultado = calcularComprobante(
    [
      {
        descripcion: "Producto",
        cantidad: 1,
        precioUnitario: Money.desde(precio),
        alicuota: ALICUOTAS_IVA.VEINTIUNO,
      },
    ],
    { tipo },
  );
  return construirSolicitudCae(
    resultado,
    { puntoDeVenta: 1, numero, fecha: FECHA },
    {
      condicionIva: CondicionIva.ConsumidorFinal,
      docTipo: DocTipo.ConsumidorFinal,
      docNumero: "0",
    },
  );
}

describe("MockServicioFiscal — autorización", () => {
  it("otorga CAE de 14 dígitos y vencimiento a 10 días", async () => {
    const fiscal = new MockServicioFiscal();
    const r = await fiscal.solicitarCae(solicitudValida(TipoComprobante.FacturaB, 1));
    expect(r.estado).toBe(EstadoCae.Autorizada);
    expect(r.cae).toMatch(/^\d{14}$/);
    expect(r.vencimientoCae?.getTime()).toBe(FECHA.getTime() + 10 * 24 * 60 * 60 * 1000);
  });

  it("avanza el último número autorizado", async () => {
    const fiscal = new MockServicioFiscal();
    expect(await fiscal.ultimoNumeroAutorizado(1, TipoComprobante.FacturaB)).toBe(0);
    await fiscal.solicitarCae(solicitudValida(TipoComprobante.FacturaB, 1));
    expect(await fiscal.ultimoNumeroAutorizado(1, TipoComprobante.FacturaB)).toBe(1);
  });

  it("autoriza comprobantes consecutivos", async () => {
    const fiscal = new MockServicioFiscal();
    const r1 = await fiscal.solicitarCae(solicitudValida(TipoComprobante.FacturaB, 1));
    const r2 = await fiscal.solicitarCae(solicitudValida(TipoComprobante.FacturaB, 2));
    expect([r1.estado, r2.estado]).toEqual([EstadoCae.Autorizada, EstadoCae.Autorizada]);
    expect(r1.cae).not.toBe(r2.cae);
  });
});

describe("MockServicioFiscal — validaciones tipo ARCA", () => {
  it("rechaza numeración no consecutiva", async () => {
    const fiscal = new MockServicioFiscal();
    const r = await fiscal.solicitarCae(solicitudValida(TipoComprobante.FacturaB, 5));
    expect(r.estado).toBe(EstadoCae.Rechazada);
    expect(r.errores?.[0]?.codigo).toBe(10016);
  });

  it("rechaza si el total no coincide con neto + IVA", async () => {
    const fiscal = new MockServicioFiscal();
    const base = solicitudValida(TipoComprobante.FacturaB, 1);
    const r = await fiscal.solicitarCae({ ...base, total: Money.desde("1500") });
    expect(r.estado).toBe(EstadoCae.Rechazada);
    expect(r.errores?.[0]?.codigo).toBe(10048);
  });

  it("rechaza un comprobante C con IVA", async () => {
    const fiscal = new MockServicioFiscal();
    const s: SolicitudCae = {
      tipoComprobante: TipoComprobante.FacturaC,
      puntoDeVenta: 1,
      numero: 1,
      fecha: FECHA,
      condicionIvaReceptor: CondicionIva.ConsumidorFinal,
      docTipo: DocTipo.ConsumidorFinal,
      docNumero: "0",
      netoGravado: Money.desde("1000"),
      iva: Money.desde("210"),
      total: Money.desde("1210"),
      subtotalesPorAlicuota: [],
    };
    const r = await fiscal.solicitarCae(s);
    expect(r.estado).toBe(EstadoCae.Rechazada);
    expect(r.errores?.[0]?.codigo).toBe(10051);
  });

  it("puede forzar el rechazo (para probar el camino de error)", async () => {
    const fiscal = new MockServicioFiscal({ forzarRechazo: true });
    const r = await fiscal.solicitarCae(solicitudValida(TipoComprobante.FacturaB, 1));
    expect(r.estado).toBe(EstadoCae.Rechazada);
  });
});
