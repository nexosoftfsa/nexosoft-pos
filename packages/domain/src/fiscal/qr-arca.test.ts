import { describe, expect, it } from "vitest";

import { llevaQrFiscal, URL_QR_ARCA, urlQrArca } from "./qr-arca.js";

const DATOS = {
  fecha: new Date(2026, 7, 27),
  cuit: "20-35678007-9",
  puntoDeVenta: 1,
  tipoComprobante: 11,
  numeroComprobante: 42,
  importe: "1500.00",
  cae: "75123456789012",
};

/** Devuelve el JSON que quedó adentro del QR. */
function payloadDe(url: string): Record<string, unknown> {
  const p = new URL(url).searchParams.get("p") ?? "";
  return JSON.parse(Buffer.from(p, "base64").toString("utf8")) as Record<string, unknown>;
}

describe("urlQrArca", () => {
  it("apunta al verificador de ARCA", () => {
    expect(urlQrArca(DATOS).startsWith(URL_QR_ARCA)).toBe(true);
  });

  it("lleva los campos con los nombres exactos que fija ARCA", () => {
    // Cambiar cualquiera de estos nombres hace que el comprobante no se pueda
    // verificar al escanearlo.
    const p = payloadDe(urlQrArca(DATOS));
    expect(Object.keys(p).sort()).toEqual(
      [
        "codAut",
        "ctz",
        "cuit",
        "fecha",
        "importe",
        "moneda",
        "nroCmp",
        "nroDocRec",
        "ptoVta",
        "tipoCmp",
        "tipoCodAut",
        "tipoDocRec",
        "ver",
      ].sort(),
    );
  });

  it("la fecha va como yyyy-mm-dd (distinto del formato de WSFEv1)", () => {
    expect(payloadDe(urlQrArca(DATOS)).fecha).toBe("2026-08-27");
  });

  it("el CUIT va numérico y sin guiones", () => {
    expect(payloadDe(urlQrArca(DATOS)).cuit).toBe(20356780079);
  });

  it("el CAE viaja como codAut, numérico", () => {
    expect(payloadDe(urlQrArca(DATOS)).codAut).toBe(75123456789012);
    expect(payloadDe(urlQrArca(DATOS)).tipoCodAut).toBe("E");
  });

  it("sin receptor asume consumidor final", () => {
    const p = payloadDe(urlQrArca(DATOS));
    expect(p.tipoDocRec).toBe(99);
    expect(p.nroDocRec).toBe(0);
  });

  it("respeta el receptor cuando la venta lo tiene", () => {
    const p = payloadDe(urlQrArca({ ...DATOS, tipoDocReceptor: 80, nroDocReceptor: 30712345671 }));
    expect(p.tipoDocRec).toBe(80);
    expect(p.nroDocRec).toBe(30712345671);
  });

  it("el importe conserva los centavos", () => {
    expect(payloadDe(urlQrArca({ ...DATOS, importe: "1234.56" })).importe).toBe(1234.56);
  });

  it("siempre en pesos y con cotización 1", () => {
    const p = payloadDe(urlQrArca(DATOS));
    expect(p.moneda).toBe("PES");
    expect(p.ctz).toBe(1);
  });
});

describe("llevaQrFiscal", () => {
  it("sin CAE no hay QR: no habría nada que verificar", () => {
    expect(llevaQrFiscal(null)).toBe(false);
    expect(llevaQrFiscal(undefined)).toBe(false);
    expect(llevaQrFiscal("")).toBe(false);
    expect(llevaQrFiscal("   ")).toBe(false);
  });

  it("con CAE sí", () => {
    expect(llevaQrFiscal("75123456789012")).toBe(true);
  });
});
