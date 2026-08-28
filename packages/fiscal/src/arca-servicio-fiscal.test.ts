import { describe, expect, it } from "vitest";

import { ErrorFiscal, TipoComprobante } from "@nexosoft/domain";

import { codigoComprobanteArca } from "./arca-servicio-fiscal.js";

/**
 * `codigoComprobanteArca` vive en `@nexosoft/domain` y se re-exporta desde acá.
 * Estos tests cuidan ese camino, que es el que usa el POS.
 *
 * El `ArcaServicioFiscal` que este archivo probaba antes ya no existe: la
 * emisión real se implementó en `apps/cloud-api/src/fiscal/arca/` (ADR-0058).
 */
describe("codigoComprobanteArca (CbteTipo de WSFEv1)", () => {
  it("mapea facturas", () => {
    expect(codigoComprobanteArca(TipoComprobante.FacturaA)).toBe(1);
    expect(codigoComprobanteArca(TipoComprobante.FacturaB)).toBe(6);
    expect(codigoComprobanteArca(TipoComprobante.FacturaC)).toBe(11);
  });

  it("mapea notas de crédito y débito", () => {
    expect(codigoComprobanteArca(TipoComprobante.NotaCreditoA)).toBe(3);
    expect(codigoComprobanteArca(TipoComprobante.NotaCreditoB)).toBe(8);
    expect(codigoComprobanteArca(TipoComprobante.NotaCreditoC)).toBe(13);
    expect(codigoComprobanteArca(TipoComprobante.NotaDebitoA)).toBe(2);
    expect(codigoComprobanteArca(TipoComprobante.NotaDebitoC)).toBe(12);
  });

  it("rechaza comprobantes no fiscales", () => {
    expect(() => codigoComprobanteArca(TipoComprobante.Remito)).toThrow(ErrorFiscal);
  });
});
