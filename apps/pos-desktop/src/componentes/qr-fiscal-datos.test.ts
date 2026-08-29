import { describe, expect, it } from "vitest";

import { Money } from "@nexosoft/domain";
import type { DatosTicket } from "@nexosoft/hardware";

import { conQrFiscal, llevaQr, pathDeModulos } from "./qr-fiscal-datos";

const TICKET: DatosTicket = {
  razonSocial: "Comercio de prueba",
  cuit: "20-35678007-9",
  condicionIvaEmisor: "Monotributo",
  puntoDeVenta: 2,
  tipoComprobante: "Factura C",
  numero: 100,
  fecha: new Date(2026, 7, 29),
  condicionIvaReceptor: "Consumidor Final",
  lineas: [],
  subtotalesIva: [],
  descuento: Money.cero(),
  total: Money.desde("850.00"),
  formasDePago: [],
  vuelto: Money.cero(),
  cae: "86350824959165",
  codigoComprobanteArca: 11,
};

describe("llevaQr", () => {
  it("necesita CAE y codigo de comprobante", () => {
    expect(llevaQr(TICKET)).toBe(true);
  });

  it("sin CAE no lleva: el comprobante todavia no esta autorizado", () => {
    const { cae, ...sinCae } = TICKET;
    expect(llevaQr(sinCae)).toBe(false);
  });

  it("sin codigo de ARCA no lleva: el codigo va adentro del QR", () => {
    const { codigoComprobanteArca, ...sinCodigo } = TICKET;
    expect(llevaQr(sinCodigo)).toBe(false);
  });
});

describe("pathDeModulos", () => {
  it("dibuja un cuadrado por modulo oscuro, corrido por la zona silenciosa", () => {
    // Un solo modulo encendido, en (0,0): con margen 4 arranca en (4,4).
    expect(pathDeModulos({ size: 1, data: Uint8Array.from([1]) })).toBe("M4 4h1v1h-1z");
  });

  it("ignora los modulos claros", () => {
    expect(pathDeModulos({ size: 2, data: Uint8Array.from([0, 0, 0, 0]) })).toBe("");
  });

  it("recorre por filas y columnas", () => {
    const d = pathDeModulos({ size: 2, data: Uint8Array.from([1, 0, 0, 1]) });
    expect(d).toBe("M4 4h1v1h-1zM5 5h1v1h-1z");
  });
});

describe("conQrFiscal", () => {
  it("resuelve el QR ANTES de imprimir, no como una imagen a cargar", async () => {
    // Es la razon de existir de todo esto: window.print() no espera nada.
    const r = await conQrFiscal(TICKET);

    expect(r.qr).toBeDefined();
    expect(r.qr?.path.length).toBeGreaterThan(0);
    // El viewBox tiene que incluir la zona silenciosa de 4 modulos por lado.
    expect(r.qr?.lado).toBeGreaterThan(8);
  });

  it("un comprobante sin CAE pasa igual, sin QR", async () => {
    const { cae, ...sinCae } = TICKET;
    const r = await conQrFiscal(sinCae);
    expect(r.qr).toBeUndefined();
  });

  it("no modifica el resto de los datos del ticket", async () => {
    const r = await conQrFiscal(TICKET);
    expect(r.numero).toBe(TICKET.numero);
    expect(r.cae).toBe(TICKET.cae);
    expect(r.total.aDecimalString(2)).toBe("850.00");
  });
});
