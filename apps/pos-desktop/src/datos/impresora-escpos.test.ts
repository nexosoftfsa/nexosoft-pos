import { beforeEach, describe, expect, it, vi } from "vitest";

import { Money } from "@nexosoft/domain";
import type { DatosTicket } from "@nexosoft/hardware";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args) as unknown,
}));

const { ErrorImpresoraVirtual, ImpresoraEscPos, olvidarImpresoras } = await import(
  "./impresora-escpos"
);

const TERMICA = {
  nombre: "EPSON TM-T20II",
  puerto: "USB001",
  driver: "EPSON TM-T20II Receipt",
  sirve_para_ticket: true,
  predeterminada: false,
};
const PDF = {
  nombre: "Microsoft Print to PDF",
  puerto: "PORTPROMPT:",
  driver: "Microsoft Print To PDF",
  sirve_para_ticket: false,
  predeterminada: true,
};

const TICKET: DatosTicket = {
  razonSocial: "Comercio de prueba",
  cuit: "20-35678007-9",
  condicionIvaEmisor: "Monotributo",
  puntoDeVenta: 4,
  tipoComprobante: "Factura C",
  numero: 1,
  fecha: new Date(2026, 7, 28),
  condicionIvaReceptor: "Consumidor Final",
  lineas: [],
  subtotalesIva: [],
  descuento: Money.cero(),
  total: Money.cero(),
  formasDePago: [],
  vuelto: Money.cero(),
};

/** Responde a los comandos nativos según cuáles impresoras estén instaladas. */
function conImpresoras(instaladas: unknown[], predeterminada: string) {
  invoke.mockImplementation((comando: string) => {
    if (comando === "listar_impresoras") return Promise.resolve(instaladas);
    if (comando === "impresora_predeterminada") return Promise.resolve(predeterminada);
    return Promise.resolve(undefined);
  });
}

describe("ImpresoraEscPos: a dónde sale el ticket", () => {
  beforeEach(() => {
    invoke.mockReset();
    olvidarImpresoras();
  });

  it("no manda un solo byte a una impresora virtual", async () => {
    // El bug real: el driver de PDF aceptaba los bytes ESC/POS, los guardaba
    // crudos en un archivo y el spooler decía que todo salió bien.
    conImpresoras([TERMICA, PDF], PDF.nombre);

    await expect(new ImpresoraEscPos().imprimirTicket(TICKET)).rejects.toBeInstanceOf(
      ErrorImpresoraVirtual,
    );
    expect(invoke).not.toHaveBeenCalledWith("imprimir_escpos", expect.anything());
  });

  it("el error dice a qué impresora iba", async () => {
    conImpresoras([TERMICA, PDF], PDF.nombre);

    const e = await new ImpresoraEscPos()
      .imprimirTicket(TICKET)
      .then(() => null)
      .catch((err: unknown) => err as InstanceType<typeof ErrorImpresoraVirtual>);

    expect(e?.impresora).toBe("Microsoft Print to PDF");
  });

  it("con una térmica de verdad imprime", async () => {
    conImpresoras([TERMICA], TERMICA.nombre);

    await new ImpresoraEscPos().imprimirTicket(TICKET);

    expect(invoke).toHaveBeenCalledWith(
      "imprimir_escpos",
      expect.objectContaining({ datos: expect.any(Array) }),
    );
  });

  it("si no se puede averiguar el destino, no frena la venta", async () => {
    // El control de Rust sigue estando: una duda nuestra no puede impedir
    // vender.
    invoke.mockImplementation((comando: string) => {
      if (comando === "listar_impresoras") return Promise.reject(new Error("sin comando"));
      return Promise.resolve("Una impresora");
    });

    await new ImpresoraEscPos().imprimirTicket(TICKET);

    expect(invoke).toHaveBeenCalledWith("imprimir_escpos", expect.anything());
  });

  it("no vuelve a preguntar la lista en cada venta", async () => {
    conImpresoras([TERMICA], TERMICA.nombre);
    const impresora = new ImpresoraEscPos();

    await impresora.imprimirTicket(TICKET);
    await impresora.imprimirTicket(TICKET);

    const listados = invoke.mock.calls.filter((c) => c[0] === "listar_impresoras");
    expect(listados).toHaveLength(1);
  });
});
