import { describe, expect, it } from "vitest";

import { CondicionIva } from "@nexosoft/domain";
import type { ConfiguracionComercio, VentaLocal } from "@nexosoft/app";

import type { Comprobante } from "../sync/cliente-ventas";
import {
  avisoFiscal,
  comprobanteDeVentaLocal,
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

  it("una nota de crédito dice qué comprobante corrige", () => {
    const nc = comprobante({
      tipoComprobante: "NotaCreditoB",
      numeroComprobante: 1,
      comprobanteAsociadoId: "v-original",
      comprobanteAsociado: { tipoComprobante: "FacturaB", numeroComprobante: 3 },
    });
    expect(datosTicketDeComprobante(nc, CONFIG).comprobanteAsociado).toEqual({
      tipo: "Factura B",
      puntoDeVenta: 1,
      numero: 3,
    });
  });

  it("una factura común no lleva comprobante asociado", () => {
    expect(datosTicketDeComprobante(comprobante(), CONFIG).comprobanteAsociado).toBeUndefined();
  });

  it("si el servidor no resolvió el asociado, no se imprime a medias", () => {
    const viejo = comprobante({
      tipoComprobante: "NotaCreditoB",
      comprobanteAsociadoId: "v-original",
    });
    expect(datosTicketDeComprobante(viejo, CONFIG).comprobanteAsociado).toBeUndefined();
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

/**
 * Sin conexión, Comprobantes muestra las ventas de la terminal. El caso que
 * importa es la que todavía no subió: no tiene número de ARCA ni CAE, y no se
 * puede fingir ninguno de los dos.
 */
describe("comprobanteDeVentaLocal", () => {
  function ventaLocal(extra: Partial<VentaLocal> = {}): VentaLocal {
    return {
      id: "v-local",
      fecha: new Date("2026-09-02T14:00:00.000Z"),
      puntoDeVenta: 2,
      numero: 33,
      numeroFiscal: null,
      tipoComprobante: "FacturaC",
      estadoCae: "PENDIENTE_CAE",
      cae: null,
      vencimientoCae: null,
      totalCentavos: 10_000,
      descuentoCentavos: 0,
      items: [
        {
          descripcion: "Servicio de consultoría",
          cantidad: "1.000",
          precioUnitarioCentavos: 10_000,
          importeCentavos: 10_000,
        },
      ],
      pagos: [{ forma: "efectivo", montoCentavos: 10_000 }],
      ...extra,
    };
  }

  it("traduce ítems, pagos y totales", () => {
    const c = comprobanteDeVentaLocal(ventaLocal());
    expect(c.total).toBe("100.00");
    expect(c.items[0]?.producto?.nombre).toBe("Servicio de consultoría");
    expect(c.items[0]?.subtotal).toBe("100.00");
    expect(c.pagos?.[0]?.medioPago).toBe("EFECTIVO");
    expect(c.medioPago).toBe("EFECTIVO");
  });

  it("sin autorizar: sin CAE y con el correlativo local, que el ticket imprime como referencia interna", () => {
    const c = comprobanteDeVentaLocal(ventaLocal());
    expect(c.cae).toBeNull();
    expect(c.numeroComprobante).toBe(33);
    expect(c.estadoFiscal).toBe("PENDIENTE");

    // Y el ticket, al no haber CAE, no lo muestra como número fiscal.
    const datos = datosTicketDeComprobante(c, { ...CONFIG, puntoDeVenta: 2 });
    expect(datos.cae).toBeUndefined();
  });

  it("ya autorizada: usa el número de ARCA, no el local", () => {
    const c = comprobanteDeVentaLocal(
      ventaLocal({ numeroFiscal: 4, cae: "86351023067383", estadoCae: "AUTORIZADA" }),
    );
    expect(c.numeroComprobante).toBe(4);
    expect(c.cae).toBe("86351023067383");
    expect(c.estadoFiscal).toBe("AUTORIZADA");
  });
});

describe("avisoFiscal", () => {
  it("una venta autorizada no avisa nada", () => {
    expect(avisoFiscal("AUTORIZADA", null)).toBeNull();
  });

  it("un ticket no fiscal tampoco: no hay CAE que esperar", () => {
    expect(avisoFiscal("NO_APLICA", null)).toBeNull();
    expect(avisoFiscal(null, null)).toBeNull();
    expect(avisoFiscal(undefined, undefined)).toBeNull();
  });

  it("una pendiente avisa que falta el CAE, sin alarmar: se resuelve sola", () => {
    const aviso = avisoFiscal("PENDIENTE", "ARCA no responde");
    expect(aviso?.etiqueta).toBe("Sin CAE");
    expect(aviso?.tono).toBe("warn");
    expect(aviso?.detalle).toContain("ARCA no responde");
  });

  it("una pendiente sin motivo igual explica qué pasa", () => {
    expect(avisoFiscal("PENDIENTE", null)?.detalle).toContain("Se autoriza solo");
  });

  it("una rechazada avisa fuerte: esa NO se arregla sola", () => {
    const aviso = avisoFiscal("RECHAZADA", "10016 Numero de comprobante invalido");
    expect(aviso?.etiqueta).toBe("Rechazada");
    expect(aviso?.tono).toBe("danger");
    expect(aviso?.detalle).toContain("10016");
  });
});
