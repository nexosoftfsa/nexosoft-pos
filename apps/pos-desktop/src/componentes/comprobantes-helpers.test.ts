import { describe, expect, it } from "vitest";

import { CondicionIva } from "@nexosoft/domain";
import type { ConfiguracionComercio } from "@nexosoft/app";

import type { Comprobante } from "../sync/cliente-ventas";
import {
  datosTicketDeComprobante,
  esAnulable,
  esFiscal,
  esNotaCredito,
  etiquetaMedioPago,
  etiquetaTipoComprobante,
  numeroComprobante,
} from "./comprobantes-helpers";

const CONFIG: ConfiguracionComercio = {
  cuit: "30-71234567-8",
  razonSocial: "Almacén de prueba",
  condicionIvaEmisor: CondicionIva.ResponsableInscripto,
  puntoDeVenta: 1,
  depositoPorDefectoId: "DEP",
  listaPredeterminadaId: "LISTA",
  preciosIncluyenIva: true,
  permitirStockNegativo: false,
};

function comprobante(overrides: Partial<Comprobante> = {}): Comprobante {
  return {
    id: "c1",
    estado: "COMPLETADA",
    subtotal: "100",
    descuento: "0",
    total: "100",
    medioPago: "EFECTIVO",
    cae: "1",
    caeFechaVto: null,
    numeroComprobante: 5,
    tipoComprobante: "FacturaB",
    creadaEn: new Date().toISOString(),
    comprobanteAsociadoId: null,
    items: [],
    ...overrides,
  };
}

describe("etiquetaTipoComprobante", () => {
  it("traduce los tipos conocidos", () => {
    expect(etiquetaTipoComprobante("FacturaB")).toBe("Factura B");
    expect(etiquetaTipoComprobante("NotaCreditoA")).toBe("Nota de Crédito A");
    expect(etiquetaTipoComprobante("TicketNoFiscal")).toBe("Ticket");
  });
  it("devuelve un texto genérico si es null", () => {
    expect(etiquetaTipoComprobante(null)).toBe("Comprobante");
  });
});

describe("esFiscal (Fase 10.1)", () => {
  it("un TicketNoFiscal no es fiscal; el resto sí", () => {
    expect(esFiscal("TicketNoFiscal")).toBe(false);
    expect(esFiscal("FacturaB")).toBe(true);
    expect(esFiscal(null)).toBe(true);
  });
});

describe("etiquetaMedioPago", () => {
  it("traduce el medio de pago", () => {
    expect(etiquetaMedioPago("TARJETA_CREDITO")).toBe("Tarjeta de crédito");
    expect(etiquetaMedioPago("OTRO")).toBe("OTRO");
  });
});

describe("numeroComprobante", () => {
  it("formatea a 8 dígitos", () => {
    expect(numeroComprobante(5)).toBe("N° 00000005");
    expect(numeroComprobante(null)).toBe("—");
  });
});

describe("esNotaCredito", () => {
  it("detecta notas de crédito", () => {
    expect(esNotaCredito("NotaCreditoB")).toBe(true);
    expect(esNotaCredito("FacturaB")).toBe(false);
    expect(esNotaCredito(null)).toBe(false);
  });
});

describe("esAnulable", () => {
  it("una factura completada es anulable", () => {
    expect(esAnulable(comprobante())).toBe(true);
  });
  it("una venta anulada no es anulable", () => {
    expect(esAnulable(comprobante({ estado: "ANULADA" }))).toBe(false);
  });
  it("una nota de crédito no es anulable", () => {
    expect(esAnulable(comprobante({ tipoComprobante: "NotaCreditoB" }))).toBe(false);
  });
});

describe("datosTicketDeComprobante (Fase 10.4)", () => {
  it("arma los datos del comercio y del comprobante para reimprimir en A4", () => {
    const c = comprobante({
      items: [
        {
          id: "i1",
          cantidad: "2",
          precioUnitario: "100",
          subtotal: "200",
          producto: { id: "p1", nombre: "Gaseosa", codigo: "G1" },
        },
      ],
      pagos: [{ id: "pg1", medioPago: "EFECTIVO", monto: "200" }],
    });
    const datos = datosTicketDeComprobante(c, CONFIG);

    expect(datos.razonSocial).toBe("Almacén de prueba");
    expect(datos.tipoComprobante).toBe("Factura B");
    expect(datos.numero).toBe(5);
    expect(datos.esFiscal).toBe(true);
    expect(datos.lineas).toHaveLength(1);
    expect(datos.lineas[0]?.descripcion).toBe("Gaseosa");
    expect(datos.lineas[0]?.importe.aDecimalString()).toBe("200.00");
    expect(datos.formasDePago[0]?.etiqueta).toBe("Efectivo");
    expect(datos.cae).toBe("1");
  });

  it("un TicketNoFiscal queda marcado esFiscal:false y sin CAE", () => {
    const c = comprobante({ tipoComprobante: "TicketNoFiscal", cae: null, caeFechaVto: null, numeroComprobante: null });
    const datos = datosTicketDeComprobante(c, CONFIG);
    expect(datos.esFiscal).toBe(false);
    expect(datos.cae).toBeUndefined();
    expect(datos.numero).toBe(0);
  });

  it("sin desglose de IVA persistido (limitación conocida del backend): subtotalesIva vacío", () => {
    const datos = datosTicketDeComprobante(comprobante(), CONFIG);
    expect(datos.subtotalesIva).toEqual([]);
  });
});
