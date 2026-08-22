import { ALICUOTAS_IVA, Cantidad, Money } from "@nexosoft/domain";
import { describe, expect, it } from "vitest";

import {
  aAsciiImprimible,
  centrar,
  COLUMNAS_58MM,
  construirEscPos,
  filaIzquierdaDerecha,
} from "./escpos.js";
import type { DatosTicket } from "./impresora.js";

const ticket = (extra: Partial<DatosTicket> = {}): DatosTicket => ({
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
  ],
  subtotalesIva: [],
  descuento: Money.cero(),
  total: Money.desde("2500"),
  formasDePago: [{ etiqueta: "Efectivo", monto: Money.desde("2500") }],
  vuelto: Money.cero(),
  ...extra,
});

/**
 * Texto imprimible del ticket, salteando las secuencias de comando completas.
 * OJO: no alcanza con filtrar los bytes < 0x20 — el ESC (0x1b) desaparecería
 * pero la letra del comando (`E` de ESC E, `a` de ESC a) quedaría como si
 * fuera texto, y las líneas parecerían más largas de lo que son.
 */
function texto(bytes: Uint8Array): string {
  /** Largo total de la secuencia que arranca en `i`, o 0 si es texto. */
  function largoComando(i: number): number {
    const b = bytes[i];
    const sig = bytes[i + 1];
    if (b === 0x1b) {
      if (sig === 0x40) return 2; // ESC @
      if (sig === 0x70) return 5; // ESC p m t1 t2 (cajón)
      return 3; // ESC a n / ESC E n / ESC d n
    }
    if (b === 0x1d) {
      if (sig === 0x56) return 4; // GS V 66 n (corte)
      return 3; // GS ! n
    }
    return 0;
  }

  let salida = "";
  let i = 0;
  while (i < bytes.length) {
    const salto = largoComando(i);
    if (salto > 0) {
      i += salto;
      continue;
    }
    salida += String.fromCharCode(bytes[i]!);
    i += 1;
  }
  return salida;
}

describe("aAsciiImprimible", () => {
  it("saca tildes y convierte la ñ (las térmicas usan páginas de código de DOS)", () => {
    expect(aAsciiImprimible("CAÑUELAS Almacén")).toBe("CANUELAS Almacen");
  });
  it("reemplaza cualquier otro carácter no imprimible", () => {
    expect(aAsciiImprimible("Café — 20°")).toBe("Cafe   20 ");
  });
});

describe("filaIzquierdaDerecha", () => {
  it("alinea el importe contra el borde derecho", () => {
    const fila = filaIzquierdaDerecha("1 x $ 2.500,00", "$ 2.500,00");
    expect(fila).toHaveLength(COLUMNAS_58MM);
    expect(fila.endsWith("$ 2.500,00")).toBe(true);
  });
  it("recorta la izquierda para que nunca se pase del ancho", () => {
    const fila = filaIzquierdaDerecha("UNA DESCRIPCION EXAGERADAMENTE LARGA", "$ 1,00");
    expect(fila).toHaveLength(COLUMNAS_58MM);
    expect(fila.endsWith("$ 1,00")).toBe(true);
  });
  it("deja al menos un espacio entre ambos lados", () => {
    const fila = filaIzquierdaDerecha("X".repeat(40), "$ 999.999,00");
    expect(fila).toContain(" $ 999.999,00");
  });
});

describe("centrar", () => {
  it("centra sin pasarse del ancho", () => {
    expect(centrar("HOLA").trimEnd()).toBe(" ".repeat(14) + "HOLA");
  });
});

describe("construirEscPos", () => {
  it("arranca inicializando la impresora y termina con el corte", () => {
    const b = construirEscPos(ticket());
    expect(Array.from(b.slice(0, 2))).toEqual([0x1b, 0x40]); // ESC @
    expect(Array.from(b.slice(-4))).toEqual([0x1d, 0x56, 0x42, 0x00]); // GS V 66 0
  });

  it("incluye comercio, comprobante, ítems y total", () => {
    const t = texto(construirEscPos(ticket()));
    expect(t).toContain("LAGUS Minimarket");
    expect(t).toContain("CUIT 00-0000000-0");
    expect(t).toContain("0001-00000016");
    expect(t).toContain("COCA COLA 1L");
    expect(t).toContain("$ 2.500,00");
    expect(t).toContain("TOTAL");
  });

  it("ninguna línea supera el ancho del papel", () => {
    const t = texto(
      construirEscPos(
        ticket({
          lineas: [
            {
              descripcion: "UN PRODUCTO CON NOMBRE MUY MUY LARGO QUE NO ENTRA",
              cantidad: Cantidad.de("12"),
              precioUnitario: Money.desde("123456.78"),
              importe: Money.desde("1481481.36"),
            },
          ],
          total: Money.desde("1481481.36"),
        }),
      ),
    );
    const largas = t.split("\n").filter((l) => l.length > COLUMNAS_58MM);
    expect(largas, `líneas que se pasan de ${COLUMNAS_58MM} columnas`).toEqual([]);
  });

  it("avisa que no es factura cuando el comercio no emite fiscal", () => {
    expect(texto(construirEscPos(ticket()))).toContain("NO VALIDO COMO FACTURA");
  });

  it("imprime el vuelto solo si es positivo", () => {
    expect(texto(construirEscPos(ticket()))).not.toContain("VUELTO");
    const conVuelto = texto(
      construirEscPos(ticket({ formasDePago: [{ etiqueta: "Efectivo", monto: Money.desde("5000") }], vuelto: Money.desde("2500") })),
    );
    expect(conVuelto).toContain("VUELTO");
  });

  it("imprime el CAE cuando el comprobante está autorizado", () => {
    const t = texto(
      construirEscPos(ticket({ esFiscal: true, cae: "75123456789012", vencimientoCae: new Date(2026, 8, 1) })),
    );
    expect(t).toContain("CAE 75123456789012");
  });

  it("respeta el ancho de 80mm cuando se le pasan 48 columnas", () => {
    const t = texto(construirEscPos(ticket(), 48));
    const separadores = t.split("\n").filter((l) => l.startsWith("---"));
    expect(separadores[0]).toHaveLength(48);
  });

  it("incluye los subtotales de IVA discriminados", () => {
    const t = texto(
      construirEscPos(
        ticket({
          esFiscal: true,
          subtotalesIva: [
            { etiqueta: "IVA 21%", base: Money.desde("2066.12"), iva: Money.desde("433.88") },
          ],
        }),
      ),
    );
    expect(t).toContain("IVA 21%");
    expect(t).toContain("$ 433,88");
  });
});

// Alícuotas se importan para asegurar que el paquete de dominio resuelve en
// este contexto de test (mismo criterio que hardware.test.ts).
describe("dominio disponible", () => {
  it("tiene la alícuota del 21%", () => {
    expect(ALICUOTAS_IVA.VEINTIUNO.porcentaje).toBe(21);
  });
});
