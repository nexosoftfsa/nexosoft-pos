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
  montoDelSubtotal,
  numeroEsProvisional,
  referenciaInterna,
  subtotalNeto,
  transparenciaFiscal,
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

/**
 * La regla vive en un solo lugar porque ya nos pasó: se puso el "Subtotal neto"
 * en la impresión térmica y se olvidó el ticket HTML, y el mismo comprobante
 * salía distinto según por dónde se imprimiera.
 */
describe("subtotalNeto", () => {
  const conDesglose = [
    { etiqueta: "IVA 21%", base: Money.desde("1000.00"), iva: Money.desde("210.00") },
    { etiqueta: "IVA 10,5%", base: Money.desde("200.00"), iva: Money.desde("21.00") },
  ];

  it("en Factura A suma las bases de todas las alícuotas", () => {
    const neto = subtotalNeto(
      base({ tipoComprobante: "Factura A", subtotalesIva: conDesglose }),
    );
    expect(neto?.aDecimalString(2)).toBe("1200.00");
  });

  it("en B y C no aplica: no discriminan", () => {
    expect(
      subtotalNeto(base({ tipoComprobante: "Factura B", subtotalesIva: conDesglose })),
    ).toBeNull();
    expect(
      subtotalNeto(base({ tipoComprobante: "Factura C", subtotalesIva: conDesglose })),
    ).toBeNull();
  });

  it("una Factura A sin desglose guardado (comprobante viejo) devuelve null", () => {
    expect(subtotalNeto(base({ tipoComprobante: "Factura A" }))).toBeNull();
  });

  /**
   * Lo exento no es neto gravado: va en su propio renglón y fuera del subtotal.
   * Sumarlo daría un "Subtotal neto" distinto del `ImpNeto` declarado a ARCA.
   */
  it("el importe exento NO entra en el subtotal neto", () => {
    const neto = subtotalNeto(
      base({
        tipoComprobante: "Factura A",
        subtotalesIva: [
          { etiqueta: "IVA 21%", base: Money.desde("1000.00"), iva: Money.desde("210.00") },
          {
            etiqueta: "Exento",
            base: Money.desde("500.00"),
            iva: Money.cero(),
            esExento: true,
          },
        ],
      }),
    );
    expect(neto?.aDecimalString(2)).toBe("1000.00");
  });

  it("una Factura A con SÓLO exento no tiene subtotal neto que mostrar", () => {
    expect(
      subtotalNeto(
        base({
          tipoComprobante: "Factura A",
          subtotalesIva: [
            { etiqueta: "Exento", base: Money.desde("500.00"), iva: Money.cero(), esExento: true },
          ],
        }),
      ),
    ).toBeNull();
  });
});

describe("montoDelSubtotal", () => {
  it("de una alícuota se muestra el IVA", () => {
    expect(
      montoDelSubtotal({
        etiqueta: "IVA 21%",
        base: Money.desde("1000.00"),
        iva: Money.desde("210.00"),
      }).aDecimalString(2),
    ).toBe("210.00");
  });

  /** Su IVA es cero por definición: mostrar "$ 0,00" no le dice nada a nadie. */
  it("de un exento se muestra la base", () => {
    expect(
      montoDelSubtotal({
        etiqueta: "Exento",
        base: Money.desde("500.00"),
        iva: Money.cero(),
        esExento: true,
      }).aDecimalString(2),
    ).toBe("500.00");
  });
});

/**
 * Régimen de Transparencia Fiscal al Consumidor (Ley 27.743, RG 5614/2024),
 * obligatorio para todos los contribuyentes desde el 1/4/2025.
 *
 * Hasta el 17/9/2026 nuestras Facturas B salían con el total y nada más: ni la
 * leyenda, ni el IVA contenido, ni los otros impuestos nacionales.
 */
describe("transparenciaFiscal", () => {
  const desglose = [
    { etiqueta: "IVA 21%", base: Money.desde("1000.00"), iva: Money.desde("210.00") },
    { etiqueta: "IVA 10,5%", base: Money.desde("200.00"), iva: Money.desde("21.00") },
  ];
  const facturaB = (extra: Partial<DatosTicket> = {}) =>
    base({ tipoComprobante: "Factura B", subtotalesIva: desglose, ...extra });

  it("en una B suma el IVA de todas las alícuotas en un solo importe", () => {
    const t = transparenciaFiscal(facturaB());
    expect(t?.ivaContenido.aDecimalString(2)).toBe("231.00");
  });

  /**
   * Los internos son de etapa única: se pagan en el expendio, la primera venta
   * del fabricante. Un comercio que revende no es sujeto pasivo, y es lo que
   * imprimen los tickets de supermercado: "Imp. Internos: 0".
   */
  it("los otros impuestos nacionales van en cero si nadie los informó", () => {
    const t = transparenciaFiscal(facturaB());
    expect(t?.otrosImpuestosNacionales.aDecimalString(2)).toBe("0.00");
  });

  it("si el comercio SÍ los liquida, se imprime lo que informó", () => {
    const t = transparenciaFiscal(
      facturaB({ otrosImpuestosNacionales: Money.desde("143.58") }),
    );
    expect(t?.otrosImpuestosNacionales.aDecimalString(2)).toBe("143.58");
  });

  /**
   * El régimen es para el consumidor final y el sujeto exento, que son a
   * quienes se les emite una B. La A va a un responsable inscripto, que ya
   * recibe el IVA discriminado; la C la emite quien no tiene IVA que
   * discriminar.
   */
  it("no va en la A ni en la C", () => {
    expect(transparenciaFiscal(base({ tipoComprobante: "Factura A", subtotalesIva: desglose }))).toBeNull();
    expect(transparenciaFiscal(base({ tipoComprobante: "Factura C", subtotalesIva: desglose }))).toBeNull();
  });

  it("una Nota de Crédito B sí lo lleva: la regla es la letra", () => {
    const t = transparenciaFiscal(
      base({ tipoComprobante: "Nota de Crédito B", subtotalesIva: desglose }),
    );
    expect(t?.ivaContenido.aDecimalString(2)).toBe("231.00");
  });

  it("un ticket interno no lo lleva: no es un comprobante fiscal", () => {
    expect(
      transparenciaFiscal(base({ tipoComprobante: "Ticket", esFiscal: false, subtotalesIva: desglose })),
    ).toBeNull();
  });

  /**
   * Sin el detalle por alícuota no se sabe cuánto IVA tenía, y un "IVA
   * Contenido $ 0,00" en una B que sí lo tuvo es peor que no imprimir nada.
   * Pasa sólo al reimprimir comprobantes anteriores a que se guardara.
   */
  it("una B sin desglose guardado no imprime un cero inventado", () => {
    expect(transparenciaFiscal(base({ tipoComprobante: "Factura B" }))).toBeNull();
  });

  /** Una B de sólo productos exentos tiene IVA cero, y ese cero SÍ es cierto. */
  it("una B de sólo exentos informa cero, que es el dato real", () => {
    const t = transparenciaFiscal(
      base({
        tipoComprobante: "Factura B",
        subtotalesIva: [
          { etiqueta: "Exento", base: Money.desde("500.00"), iva: Money.cero(), esExento: true },
        ],
      }),
    );
    expect(t?.ivaContenido.aDecimalString(2)).toBe("0.00");
  });
});

/**
 * Al reimprimir desde Comprobantes un comprobante que todavía espera el CAE no
 * hay ningún número: el fiscal lo asigna ARCA y el correlativo interno lo lleva
 * la terminal que hizo la venta, no el servidor (ADR-0072).
 */
describe("referenciaInterna", () => {
  it("con número interno lo imprime, con nombre propio", () => {
    expect(referenciaInterna(base({ numero: 33 }))).toBe("Referencia interna 00000033");
  });

  it("sin número dice que no lo hay, en vez de imprimir 00000000", () => {
    expect(referenciaInterna(base({ numero: null }))).toBe("Sin numerar todavía");
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
