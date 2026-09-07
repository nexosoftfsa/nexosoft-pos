import { describe, expect, it } from "vitest";
import { TipoComprobante } from "@nexosoft/domain";

import { motivoNoFacturable } from "./venta-facturable";
import type { ClienteVenta } from "./PantallaPos";

const RI: ClienteVenta = {
  id: "c1",
  nombre: "Distribuidora Sur SRL",
  documento: "30712345671",
  condicionIva: "ResponsableInscripto",
};

describe("motivoNoFacturable", () => {
  it("una Factura A con cliente y CUIT válido se puede emitir", () => {
    expect(motivoNoFacturable(TipoComprobante.FacturaA, RI)).toBeNull();
  });

  /**
   * El caso que apareció en la prueba del 6/9/2026: el selector de receptor y
   * el de cliente son independientes, así que se emitió una "Factura A" sin
   * ningún dato del receptor.
   */
  it("una Factura A sin cliente NO se puede emitir, y lo dice", () => {
    const motivo = motivoNoFacturable(TipoComprobante.FacturaA, undefined);
    expect(motivo).toContain("CUIT");
    // El mensaje tiene que ofrecer la salida, no sólo el problema: el cajero
    // tiene al cliente adelante.
    expect(motivo).toContain("Consumidor Final");
  });

  it("una Factura A a un cliente sin CUIT válido tampoco", () => {
    // 30712345670 tiene mal el dígito verificador (el correcto es ...671).
    const motivo = motivoNoFacturable(TipoComprobante.FacturaA, {
      ...RI,
      documento: "30712345670",
    });
    expect(motivo).toContain("Distribuidora Sur SRL");
  });

  it("con el documento vacío o ausente tampoco", () => {
    expect(motivoNoFacturable(TipoComprobante.FacturaA, { ...RI, documento: null })).not.toBeNull();
    expect(motivoNoFacturable(TipoComprobante.FacturaA, { ...RI, documento: "" })).not.toBeNull();
  });

  it("acepta el CUIT con guiones, como se tipea", () => {
    expect(motivoNoFacturable(TipoComprobante.FacturaA, { ...RI, documento: "30-71234567-1" }))
      .toBeNull();
  });

  /** La B es al mostrador: identificar al comprador es opcional. */
  it("una Factura B sin cliente se emite normalmente", () => {
    expect(motivoNoFacturable(TipoComprobante.FacturaB, undefined)).toBeNull();
  });

  it("una Factura C sin cliente también", () => {
    expect(motivoNoFacturable(TipoComprobante.FacturaC, undefined)).toBeNull();
  });

  it("un ticket interno no tiene reglas fiscales", () => {
    expect(motivoNoFacturable(TipoComprobante.TicketNoFiscal, undefined)).toBeNull();
  });
});
