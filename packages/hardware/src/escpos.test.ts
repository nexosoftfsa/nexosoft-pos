import { ALICUOTAS_IVA, Cantidad, Money } from "@nexosoft/domain";
import { describe, expect, it } from "vitest";

import {
  aAsciiImprimible,
  centrar,
  COLUMNAS_58MM,
  comandoImagenRaster,
  construirEscPos,
  filaIzquierdaDerecha,
  qrARaster,
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

  /**
   * Pasó en producción: una venta sin internet imprimió "Factura C
   * 0002-00000033" y el comprobante registrado fue el 0002-00000004.
   */
  describe("comprobante fiscal sin CAE todavía", () => {
    /** Fiscal, número provisional, sin CAE: la venta que se hizo sin internet. */
    const sinCae = () =>
      ticket({ tipoComprobante: "Factura C", numero: 33, esFiscal: true });

    /** El ticket envuelve a 32 columnas: para buscar una frase hay que unir. */
    const frases = (t: string) => t.replace(/\s+/g, " ");

    it("no imprime un número fiscal que después va a cambiar", () => {
      const t = texto(construirEscPos(sinCae()));
      expect(t).not.toContain("0001-00000033");
      expect(frases(t)).toContain("Referencia interna 00000033");
    });

    it("dice que el número y el CAE los asigna ARCA", () => {
      const t = frases(texto(construirEscPos(sinCae())));
      expect(t).toContain("Pendiente de autorizacion de ARCA");
      expect(t).toContain("los asigna ARCA al autorizar");
    });

    it("con CAE sí imprime el número fiscal", () => {
      const t = texto(
        construirEscPos(
          ticket({
            tipoComprobante: "Factura C",
            numero: 33,
            esFiscal: true,
            cae: "12345678901234",
          }),
        ),
      );
      expect(t).toContain("0001-00000033");
      expect(t).not.toContain("Referencia interna");
    });

    it("un ticket no fiscal conserva su número: no espera ningún CAE", () => {
      const t = texto(construirEscPos(ticket({ numero: 33, esFiscal: false })));
      expect(t).toContain("0001-00000033");
      expect(t).not.toContain("Referencia interna");
    });
  });

  it("una nota de crédito imprime el comprobante que corrige", () => {
    const t = texto(
      construirEscPos(
        ticket({
          tipoComprobante: "Nota de Credito C",
          comprobanteAsociado: { tipo: "Factura C", puntoDeVenta: 2, numero: 3 },
        }),
      ),
    );
    expect(t).toContain("Comprobante asociado");
    expect(t).toContain("Factura C 0002-00000003");
  });

  it("una factura no imprime esa leyenda", () => {
    expect(texto(construirEscPos(ticket()))).not.toContain("Comprobante asociado");
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

describe("comandoImagenRaster (logo del comercio)", () => {
  /** 16x2 puntos = 2 bytes por fila. */
  const logo = { anchoPuntos: 16, alto: 2, bits: Uint8Array.from([0xff, 0x00, 0x0f, 0xf0]) };

  it("arma la cabecera GS v 0 con ancho en BYTES y alto en puntos", () => {
    const cmd = comandoImagenRaster(logo);
    // GS v 0 m=0, xL=2 xH=0 (2 bytes por fila), yL=2 yH=0 (2 filas)
    expect(cmd.slice(0, 8)).toEqual([0x1d, 0x76, 0x30, 0x00, 2, 0, 2, 0]);
    expect(cmd.slice(8)).toEqual([0xff, 0x00, 0x0f, 0xf0]);
  });

  it("parte el alto en dos bytes little-endian cuando pasa de 255", () => {
    const alto = 300;
    const cmd = comandoImagenRaster({
      anchoPuntos: 8,
      alto,
      bits: new Uint8Array(alto),
    });
    expect(cmd[6]).toBe(300 & 0xff); // 44
    expect(cmd[7]).toBe(1); // 300 >> 8
  });

  it("redondea el ancho a bytes completos (17 puntos → 3 bytes por fila)", () => {
    const cmd = comandoImagenRaster({ anchoPuntos: 17, alto: 1, bits: new Uint8Array(3) });
    expect(cmd[4]).toBe(3);
  });

  it("avisa si los bits no cierran con las medidas declaradas", () => {
    expect(() =>
      comandoImagenRaster({ anchoPuntos: 16, alto: 2, bits: new Uint8Array(3) }),
    ).toThrow(/16x2/);
  });

  it("el ticket incluye la imagen antes de la razón social", () => {
    const bytes = construirEscPos(ticket(), COLUMNAS_58MM, logo);
    const marca = [0x1d, 0x76, 0x30];
    const pos = Array.from(bytes).findIndex(
      (_, i) => marca.every((m, j) => bytes[i + j] === m),
    );
    expect(pos).toBeGreaterThan(-1);
    const textoDespues = Array.from(bytes.slice(pos))
      .map((b) => String.fromCharCode(b))
      .join("");
    expect(textoDespues).toContain("LAGUS Minimarket");
  });

  it("sin logo, el ticket no lleva ningún comando de imagen", () => {
    const bytes = construirEscPos(ticket());
    const hayImagen = Array.from(bytes).some(
      (_, i) => bytes[i] === 0x1d && bytes[i + 1] === 0x76 && bytes[i + 2] === 0x30,
    );
    expect(hayImagen).toBe(false);
  });
});

// Alícuotas se importan para asegurar que el paquete de dominio resuelve en
// este contexto de test (mismo criterio que hardware.test.ts).
describe("qrARaster (QR fiscal en la termica)", () => {
  /** ¿Está encendido el punto (x, y) del mapa de bits? */
  function punto(r: { anchoPuntos: number; bits: Uint8Array }, x: number, y: number): boolean {
    const bytesPorFila = Math.ceil(r.anchoPuntos / 8);
    return ((r.bits[y * bytesPorFila + (x >> 3)] ?? 0) & (0x80 >> (x & 7))) !== 0;
  }

  /** Matriz de 3x3 con una sola cruz encendida en el centro. */
  const cruz = { size: 3, data: Uint8Array.from([0, 1, 0, 1, 1, 1, 0, 1, 0]) };

  it("deja la zona silenciosa de 4 modulos alrededor", () => {
    // Sin ese margen blanco muchos lectores no enganchan el codigo.
    const r = qrARaster(cruz, 11); // 3 + 4 + 4 = 11 modulos, escala 1
    expect(r.anchoPuntos).toBe(11);
    expect(r.alto).toBe(11);

    for (let i = 0; i < 4; i++) {
      expect(punto(r, i, 5)).toBe(false); // margen izquierdo
      expect(punto(r, 5, i)).toBe(false); // margen superior
      expect(punto(r, 10 - i, 5)).toBe(false); // margen derecho
      expect(punto(r, 5, 10 - i)).toBe(false); // margen inferior
    }
  });

  it("dibuja los modulos donde corresponde", () => {
    const r = qrARaster(cruz, 11);
    // La cruz arranca en (4,4): centro encendido, esquinas apagadas.
    expect(punto(r, 5, 5)).toBe(true);
    expect(punto(r, 5, 4)).toBe(true);
    expect(punto(r, 4, 4)).toBe(false);
    expect(punto(r, 6, 6)).toBe(false);
  });

  it("agranda el QR para aprovechar el ancho del papel", () => {
    // Un QR mas grande se escanea mejor; el limite lo pone el rollo.
    const r = qrARaster(cruz, 384);
    expect(r.anchoPuntos).toBe(11 * 34); // floor(384 / 11) = 34
    expect(r.anchoPuntos).toBeLessThanOrEqual(384);
    // Cada modulo pasa a ser un cuadrado de 34x34 puntos.
    expect(punto(r, 4 * 34, 5 * 34)).toBe(true);
    expect(punto(r, 4 * 34 + 33, 5 * 34 + 33)).toBe(true);
  });

  it("nunca se pasa del ancho, ni con un QR grande", () => {
    const grande = { size: 57, data: new Uint8Array(57 * 57).fill(1) };
    for (const ancho of [384, 576]) {
      expect(qrARaster(grande, ancho).anchoPuntos).toBeLessThanOrEqual(ancho);
    }
  });

  it("el raster que produce lo acepta comandoImagenRaster", () => {
    // Si las medidas no cerraran, comandoImagenRaster tira.
    expect(() => comandoImagenRaster(qrARaster(cruz, 384))).not.toThrow();
  });
});

describe("el ticket termico lleva el QR fiscal", () => {
  const qr = qrARaster({ size: 3, data: Uint8Array.from([1, 0, 1, 0, 1, 0, 1, 0, 1]) }, 100);
  const marcaImagen = [0x1d, 0x76, 0x30];

  function posicionDe(bytes: Uint8Array, marca: readonly number[], desde = 0): number {
    for (let i = desde; i < bytes.length; i++) {
      if (marca.every((m, j) => bytes[i + j] === m)) return i;
    }
    return -1;
  }

  it("imprime el QR cuando se lo pasan", () => {
    // El ticket de papel es el que se lleva el cliente: es el que necesita QR.
    const bytes = construirEscPos(ticket({ cae: "86350824926273" }), COLUMNAS_58MM, undefined, qr);
    expect(posicionDe(bytes, marcaImagen)).toBeGreaterThan(-1);
  });

  it("sin QR el ticket sale igual (comercio sin alta, o venta sin CAE)", () => {
    const bytes = construirEscPos(ticket(), COLUMNAS_58MM);
    expect(posicionDe(bytes, marcaImagen)).toBe(-1);
  });

  it("el QR va despues del CAE, no arriba con el logo", () => {
    const logo = { anchoPuntos: 16, alto: 2, bits: Uint8Array.from([0xff, 0x00, 0x0f, 0xf0]) };
    const bytes = construirEscPos(ticket({ cae: "86350824926273" }), COLUMNAS_58MM, logo, qr);

    const posLogo = posicionDe(bytes, marcaImagen);
    const posQr = posicionDe(bytes, marcaImagen, posLogo + 1);
    expect(posLogo).toBeGreaterThan(-1);
    expect(posQr).toBeGreaterThan(posLogo);
  });
});

describe("dominio disponible", () => {
  it("tiene la alícuota del 21%", () => {
    expect(ALICUOTAS_IVA.VEINTIUNO.porcentaje).toBe(21);
  });
});
