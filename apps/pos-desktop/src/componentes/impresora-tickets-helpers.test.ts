import { describe, expect, it } from "vitest";

import type { ImpresoraDelSistema } from "../datos/impresora-escpos";
import {
  avisoDeImpresora,
  bytesPruebaImpresion,
  etiquetaImpresora,
  IMPRESORA_PREDETERMINADA,
} from "./impresora-tickets-helpers";

function impresora(p: Partial<ImpresoraDelSistema> = {}): ImpresoraDelSistema {
  return {
    nombre: "EPSON TM-T20II",
    puerto: "USB001",
    driver: "EPSON TM-T20II Receipt",
    sirveParaTicket: true,
    predeterminada: false,
    ...p,
  };
}

const PDF = impresora({
  nombre: "Microsoft Print to PDF",
  puerto: "PORTPROMPT:",
  driver: "Microsoft Print To PDF",
  sirveParaTicket: false,
});

describe("etiquetaImpresora", () => {
  it("muestra el puerto, que es lo que distingue dos parecidas", () => {
    expect(etiquetaImpresora(impresora())).toBe("EPSON TM-T20II (USB001)");
  });

  it("avisa en la propia lista cuál no sirve para tickets", () => {
    expect(etiquetaImpresora({ ...PDF, predeterminada: true })).toBe(
      "Microsoft Print to PDF (PORTPROMPT:) · predeterminada de Windows · no sirve para tickets",
    );
  });
});

describe("avisoDeImpresora", () => {
  it("no dice nada cuando la elegida es una térmica", () => {
    expect(avisoDeImpresora("EPSON TM-T20II", [impresora(), PDF])).toBeNull();
  });

  it("avisa si eligieron a mano una impresora virtual", () => {
    const aviso = avisoDeImpresora("Microsoft Print to PDF", [impresora(), PDF]);
    expect(aviso).toContain("impresora virtual");
    expect(aviso).toContain("Microsoft Print to PDF");
  });

  it("avisa cuando no se eligió nada y la predeterminada guarda un archivo", () => {
    // Este es el caso que rompió de verdad: nadie eligió nada, la
    // predeterminada de Windows era la de PDF, y el ticket terminaba en un
    // archivo mientras el POS decía que había impreso.
    const aviso = avisoDeImpresora(IMPRESORA_PREDETERMINADA, [
      impresora(),
      { ...PDF, predeterminada: true },
    ]);
    expect(aviso).toContain("predeterminada de Windows");
    expect(aviso).toContain("Microsoft Print to PDF");
  });

  it("no dice nada si la predeterminada es una térmica", () => {
    expect(
      avisoDeImpresora(IMPRESORA_PREDETERMINADA, [
        { ...impresora(), predeterminada: true },
        PDF,
      ]),
    ).toBeNull();
  });

  it("avisa si la impresora configurada ya no está instalada", () => {
    const aviso = avisoDeImpresora("Una que se fue", [impresora(), PDF]);
    expect(aviso).toContain("ya no está instalada");
  });

  it("se calla mientras la lista todavía no cargó", () => {
    expect(avisoDeImpresora("Cualquiera", [])).toBeNull();
  });
});

describe("bytesPruebaImpresion", () => {
  const bytes = bytesPruebaImpresion(new Date(2026, 7, 28, 10, 42));

  it("empieza inicializando la impresora y termina cortando el papel", () => {
    expect(bytes.slice(0, 2)).toEqual([0x1b, 0x40]);
    expect(bytes.slice(-3)).toEqual([0x1d, 0x56, 0x00]);
  });

  it("manda sólo ASCII, para no depender de la tabla de caracteres", () => {
    expect(bytes.every((b) => b >= 0 && b <= 0x7f)).toBe(true);
  });
});
