/**
 * No es una aserción: imprime en consola el ticket tal como sale por la
 * térmica, para poder mirarlo sin tener la impresora al lado.
 * `pnpm --filter @nexosoft/hardware test -- vista-previa --reporter=verbose`
 */
import { Cantidad, Money } from "@nexosoft/domain";
import { describe, expect, it } from "vitest";

import { construirEscPos, COLUMNAS_58MM } from "./escpos.js";
import type { DatosTicket } from "./impresora.js";

const DATOS: DatosTicket = {
  razonSocial: "LAGUS Minimarket",
  cuit: "00-0000000-0",
  condicionIvaEmisor: "Responsable Inscripto",
  puntoDeVenta: 1,
  tipoComprobante: "Ticket",
  numero: 16,
  fecha: new Date(2026, 7, 22, 16, 26),
  condicionIvaReceptor: "Consumidor Final",
  esFiscal: false,
  lineas: [
    {
      descripcion: "COCA COLA 1L",
      cantidad: Cantidad.de("1"),
      precioUnitario: Money.desde("2500"),
      importe: Money.desde("2500"),
    },
    {
      descripcion: "PAN",
      cantidad: Cantidad.de("1"),
      precioUnitario: Money.desde("1000"),
      importe: Money.desde("1000"),
    },
    {
      descripcion: "ACEITE CAÑUELAS GIRASOL BOTELLA 900 ML",
      cantidad: Cantidad.de("2"),
      precioUnitario: Money.desde("4200"),
      importe: Money.desde("8400"),
    },
  ],
  subtotalesIva: [],
  descuento: Money.cero(),
  total: Money.desde("11900"),
  formasDePago: [{ etiqueta: "Efectivo", monto: Money.desde("15000") }],
  vuelto: Money.desde("3100"),
};

describe("vista previa del ticket", () => {
  it("se ve bien a 32 columnas (58mm)", () => {
    const bytes = construirEscPos(DATOS);
    const texto = Array.from(bytes)
      .map((b, i, a) => {
        if (b === 0x1b || b === 0x1d) return null;
        const prev = a[i - 1];
        const prev2 = a[i - 2];
        if (prev === 0x1b || prev === 0x1d) return null;
        if (prev2 === 0x1b || prev2 === 0x1d) return null;
        return b === 0x0a ? "\n" : String.fromCharCode(b);
      })
      .filter((c): c is string => c !== null)
      .join("");

    const regla = "".padEnd(COLUMNAS_58MM, "·");
    // eslint-disable-next-line no-console
    console.log(`\n${regla}\n${texto}${regla}\n`);
    expect(bytes.length).toBeGreaterThan(0);
  });
});
