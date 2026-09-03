/**
 * Tests de las funciones puras que deciden CÓMO se pinta un comprobante. La
 * lógica está acá porque los tres renderers (térmica, ticket HTML, A4) tienen
 * que llegar a la misma conclusión: si algo se decide en cada uno por separado,
 * termina divergiendo.
 */
import { describe, expect, it } from "vitest";

import { Cantidad, Money } from "@nexosoft/domain";

import type { DatosTicket } from "./impresora.js";
import {
  letraFiscal,
  llevaDatosDelReceptor,
  numeroEsProvisional,
} from "./impresora.js";

/** Base de datos suficiente para ejercitar las reglas; nada más. */
const base = (extra: Partial<DatosTicket> = {}): DatosTicket => ({
  razonSocial: "Comercio",
  cuit: "20-00000000-0",
  condicionIvaEmisor: "Responsable Inscripto",
  puntoDeVenta: 1,
  tipoComprobante: "Factura C",
  numero: 1,
  fecha: new Date(2026, 8, 3, 10, 0),
  condicionIvaReceptor: "Consumidor Final",
  esFiscal: true,
  lineas: [
    {
      descripcion: "X",
      cantidad: Cantidad.de("1"),
      precioUnitario: Money.desde("100"),
      importe: Money.desde("100"),
    },
  ],
  subtotalesIva: [],
  descuento: Money.cero(),
  total: Money.desde("100"),
  formasDePago: [],
  vuelto: Money.cero(),
  ...extra,
});

describe("letraFiscal", () => {
  it("saca la letra de la última posición de tipoComprobante", () => {
    expect(letraFiscal(base({ tipoComprobante: "Factura A" }))).toBe("A");
    expect(letraFiscal(base({ tipoComprobante: "Factura B" }))).toBe("B");
    expect(letraFiscal(base({ tipoComprobante: "Factura C" }))).toBe("C");
    expect(letraFiscal(base({ tipoComprobante: "Nota de Crédito A" }))).toBe("A");
  });

  it("todo lo que no termina en A/B/C es X", () => {
    expect(letraFiscal(base({ tipoComprobante: "Ticket" }))).toBe("X");
    expect(letraFiscal(base({ tipoComprobante: "Remito" }))).toBe("X");
  });
});

describe("llevaDatosDelReceptor", () => {
  const conReceptor = {
    razonSocial: "Distribuidora Sur SRL",
    documento: "30712345670",
  };

  it("A siempre, aunque no venga receptor: ARCA lo exige de todas formas", () => {
    // Nota: sin receptor el renderer igual no puede pintar nada, pero la regla
    // es que la letra manda. La app arma el receptor a partir del cliente
    // elegido y una A sin cliente no debería llegar hasta acá.
    expect(llevaDatosDelReceptor(base({ tipoComprobante: "Factura A" }))).toBe(true);
  });

  it("B sólo si hay cliente identificado: no ensuciar el ticket al mostrador", () => {
    expect(llevaDatosDelReceptor(base({ tipoComprobante: "Factura B" }))).toBe(false);
    expect(
      llevaDatosDelReceptor(base({ tipoComprobante: "Factura B", receptor: conReceptor })),
    ).toBe(true);
  });

  it("C nunca, aunque venga cliente: es venta al consumidor final del mostrador", () => {
    expect(
      llevaDatosDelReceptor(base({ tipoComprobante: "Factura C", receptor: conReceptor })),
    ).toBe(false);
  });
});

describe("numeroEsProvisional", () => {
  it("un ticket interno con número confirmado NO es provisional", () => {
    expect(
      numeroEsProvisional(base({ esFiscal: false, numeroConfirmado: true })),
    ).toBe(false);
  });

  it("un fiscal con número del servidor pero sin CAE SIGUE siendo provisional (ADR-0068)", () => {
    // El caso que apareció en producción: el servidor le pone el 102 y ARCA
    // después el 7. Sólo el CAE prueba que el número es el fiscal.
    expect(
      numeroEsProvisional(
        base({ tipoComprobante: "Factura B", esFiscal: true, numeroConfirmado: true }),
      ),
    ).toBe(true);
  });

  it("un fiscal con CAE ya no es provisional", () => {
    expect(
      numeroEsProvisional(
        base({ tipoComprobante: "Factura B", esFiscal: true, cae: "12345678901234" }),
      ),
    ).toBe(false);
  });
});
