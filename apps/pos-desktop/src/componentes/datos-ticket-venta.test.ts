/**
 * El contrato de `construirDatosTicket`: **el número fiscal y el receptor son
 * independientes**, y el ticket tiene que llevar los dos cuando los dos están.
 *
 * El 8/9/2026 salieron cuatro tickets de prueba y ninguno estaba completo:
 * los del cajero "tranquilo" traían número, CAE y QR pero sin los datos del
 * receptor; los del cajero "apurado" traían el receptor pero sin CAE ni QR.
 * El defecto no estaba en esta función —hace lo correcto con lo que recibe—
 * sino en QUÉ se le pasaba: la pantalla leía el cliente y la respuesta del
 * servidor de su propio estado, que la venta ya había limpiado (ADR-0073).
 *
 * Estos tests fijan el contrato. La carrera en sí no se puede cubrir acá: se
 * cubre estructuralmente (una foto en un ref, y esperar la misma promesa que
 * espera la venta) y se verifica en campo.
 */
import { describe, expect, it } from "vitest";
import {
  ALICUOTAS_IVA,
  Cantidad,
  CondicionIva,
  EstadoCae,
  Money,
  TipoComprobante,
} from "@nexosoft/domain";
import type { VentaConfirmada } from "@nexosoft/app";

import { construirDatosTicket, type ClienteVenta } from "./PantallaPos";

const CONFIG = {
  cuit: "20-35678007-9",
  razonSocial: "Sergio Sebastian Rivarola",
  condicionIvaEmisor: CondicionIva.ResponsableInscripto,
  puntoDeVenta: 2,
  depositoPorDefectoId: "principal",
  listaPredeterminadaId: "minorista",
  preciosIncluyenIva: true,
  permitirStockNegativo: false,
  emiteComprobantesFiscales: true,
} as unknown as import("@nexosoft/app").ConfiguracionComercio;

const RECEPTOR: ClienteVenta = {
  id: "c1",
  nombre: "Distribuidora Sur SRL",
  documento: "30712345671",
  condicionIva: "ResponsableInscripto",
  direccion: "Av. Corrientes 1234",
};

/** Venta local recién confirmada: número correlativo de la terminal, sin CAE. */
function venta(): VentaConfirmada {
  const precio = Money.desde("1650.00");
  return {
    id: "v1",
    fecha: new Date(2026, 8, 8, 13, 58),
    puntoDeVenta: 2,
    numero: 11,
    tipoComprobante: TipoComprobante.FacturaA,
    condicionIvaReceptor: CondicionIva.ResponsableInscripto,
    estadoCae: EstadoCae.PendienteCae,
    items: [
      {
        articuloId: "aceite",
        descripcion: "Aceite de Girasol 900ml",
        cantidad: Cantidad.de("1"),
        precioUnitario: precio,
        alicuotaIva: ALICUOTAS_IVA.VEINTIUNO,
      },
    ],
    resultado: {
      lineas: [{ importe: precio }],
      subtotalesPorAlicuota: [
        {
          alicuota: ALICUOTAS_IVA.VEINTIUNO,
          neto: Money.desde("1363.64"),
          iva: Money.desde("286.36"),
        },
      ],
      descuento: Money.cero(),
      recargo: Money.cero(),
      total: precio,
    },
    pagos: [],
    vuelto: Money.cero(),
  } as unknown as VentaConfirmada;
}

/** Lo que devuelve el servidor cuando ARCA ya autorizó. */
const DEL_SERVIDOR = {
  tipoComprobante: "FacturaA",
  numeroComprobante: 10,
  cae: "86360865578637",
  caeFechaVto: "2026-09-18T00:00:00.000Z",
};

describe("construirDatosTicket", () => {
  it("con respuesta del servidor Y receptor, el ticket lleva los dos", () => {
    const d = construirDatosTicket(venta(), CONFIG, [], [], [], DEL_SERVIDOR as never, RECEPTOR);

    expect(d.numero).toBe(10);
    expect(d.numeroConfirmado).toBe(true);
    expect(d.cae).toBe("86360865578637");
    expect(d.receptor?.razonSocial).toBe("Distribuidora Sur SRL");
    expect(d.receptor?.documento).toBe("30712345671");
    expect(d.receptor?.domicilio).toBe("Av. Corrientes 1234");
  });

  /** El ticket del "cajero tranquilo": tenía número y CAE, y perdía al cliente. */
  it("con respuesta del servidor y SIN receptor, no inventa uno", () => {
    const d = construirDatosTicket(venta(), CONFIG, [], [], [], DEL_SERVIDOR as never, undefined);

    expect(d.cae).toBe("86360865578637");
    expect(d.receptor).toBeUndefined();
  });

  /**
   * El ticket del "cajero apurado". Sigue siendo la salida correcta cuando el
   * servidor todavía no contestó: número interno, sin CAE, y el ticket lo dice.
   * Lo que estaba mal era llegar acá por una carrera de tecleo.
   */
  it("sin respuesta del servidor, el número es el interno y no hay CAE", () => {
    const d = construirDatosTicket(venta(), CONFIG, [], [], [], null, RECEPTOR);

    expect(d.numero).toBe(11);
    expect(d.numeroConfirmado).toBe(false);
    expect(d.cae).toBeUndefined();
    // El receptor no depende de ARCA: sale igual.
    expect(d.receptor?.razonSocial).toBe("Distribuidora Sur SRL");
  });

  it("un cliente sin documento no arma receptor: ARCA lo exige en la A", () => {
    const d = construirDatosTicket(venta(), CONFIG, [], [], [], null, {
      ...RECEPTOR,
      documento: "",
    });

    expect(d.receptor).toBeUndefined();
  });
});
