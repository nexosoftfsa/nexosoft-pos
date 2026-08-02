import { describe, expect, it } from "vitest";

import { ErrorFiscal } from "../comun/errores.js";
import { CondicionIva } from "./condicion-iva.js";
import {
  discriminaIva,
  EstadoCae,
  letraDe,
  notaCreditoPara,
  notaDebitoPara,
  requiereCae,
  resolverTipoComprobante,
  TipoComprobante,
} from "./tipo-comprobante.js";

describe("resolverTipoComprobante — matriz emisor × receptor (ADR-0012)", () => {
  it("Emisor RI → receptor RI emite Factura A", () => {
    expect(
      resolverTipoComprobante(CondicionIva.ResponsableInscripto, CondicionIva.ResponsableInscripto),
    ).toBe(TipoComprobante.FacturaA);
  });

  it.each([
    CondicionIva.ConsumidorFinal,
    CondicionIva.Monotributo,
    CondicionIva.Exento,
    CondicionIva.NoCategorizado,
  ])("Emisor RI → receptor %s emite Factura B", (receptor) => {
    expect(resolverTipoComprobante(CondicionIva.ResponsableInscripto, receptor)).toBe(
      TipoComprobante.FacturaB,
    );
  });

  it.each([
    CondicionIva.ResponsableInscripto,
    CondicionIva.ConsumidorFinal,
    CondicionIva.Monotributo,
    CondicionIva.Exento,
  ])("Emisor Monotributo → receptor %s emite Factura C", (receptor) => {
    expect(resolverTipoComprobante(CondicionIva.Monotributo, receptor)).toBe(
      TipoComprobante.FacturaC,
    );
  });

  it.each([CondicionIva.ConsumidorFinal, CondicionIva.Exento, CondicionIva.NoCategorizado])(
    "un emisor %s no puede emitir (error fiscal)",
    (emisor) => {
      expect(() => resolverTipoComprobante(emisor, CondicionIva.ConsumidorFinal)).toThrow(
        ErrorFiscal,
      );
    },
  );
});

describe("letra y discriminación de IVA", () => {
  it("solo la letra A discrimina IVA", () => {
    expect(discriminaIva(TipoComprobante.FacturaA)).toBe(true);
    expect(discriminaIva(TipoComprobante.FacturaB)).toBe(false);
    expect(discriminaIva(TipoComprobante.FacturaC)).toBe(false);
  });

  it("deriva la letra del tipo", () => {
    expect(letraDe(TipoComprobante.FacturaA)).toBe("A");
    expect(letraDe(TipoComprobante.NotaCreditoB)).toBe("B");
    expect(letraDe(TipoComprobante.NotaDebitoC)).toBe("C");
    expect(letraDe(TipoComprobante.Remito)).toBe("X");
  });
});

describe("requiereCae", () => {
  it("las facturas requieren CAE", () => {
    expect(requiereCae(TipoComprobante.FacturaA)).toBe(true);
    expect(requiereCae(TipoComprobante.NotaCreditoC)).toBe(true);
  });

  it("remito, presupuesto y ticket no fiscal no requieren CAE", () => {
    expect(requiereCae(TipoComprobante.Remito)).toBe(false);
    expect(requiereCae(TipoComprobante.Presupuesto)).toBe(false);
    expect(requiereCae(TipoComprobante.TicketNoFiscal)).toBe(false);
  });
});

describe("TicketNoFiscal (Fase 10.1 — comercio sin alta en ARCA)", () => {
  it("no tiene letra fiscal ni discrimina IVA, igual que Remito/Presupuesto", () => {
    expect(letraDe(TipoComprobante.TicketNoFiscal)).toBe("X");
    expect(discriminaIva(TipoComprobante.TicketNoFiscal)).toBe(false);
  });
});

describe("notas asociadas heredan la letra de la factura", () => {
  it("Nota de Crédito", () => {
    expect(notaCreditoPara(TipoComprobante.FacturaA)).toBe(TipoComprobante.NotaCreditoA);
    expect(notaCreditoPara(TipoComprobante.FacturaB)).toBe(TipoComprobante.NotaCreditoB);
    expect(notaCreditoPara(TipoComprobante.FacturaC)).toBe(TipoComprobante.NotaCreditoC);
  });

  it("Nota de Débito", () => {
    expect(notaDebitoPara(TipoComprobante.FacturaA)).toBe(TipoComprobante.NotaDebitoA);
  });

  it("un remito no admite nota asociada", () => {
    expect(() => notaCreditoPara(TipoComprobante.Remito)).toThrow(ErrorFiscal);
  });
});

describe("EstadoCae", () => {
  it("expone los estados del flujo offline-first", () => {
    expect(EstadoCae.Borrador).toBe("BORRADOR");
    expect(EstadoCae.PendienteCae).toBe("PENDIENTE_CAE");
    expect(EstadoCae.Autorizada).toBe("AUTORIZADA");
    expect(EstadoCae.Rechazada).toBe("RECHAZADA");
  });
});
