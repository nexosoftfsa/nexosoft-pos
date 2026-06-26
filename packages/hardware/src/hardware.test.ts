import { describe, it, expect, beforeEach } from "vitest";
import { Cantidad, Money } from "@nexosoft/domain";
import { MockImpresoraTermica, MockLectorDeBarras, MockBalanza } from "./mocks/index.js";
import type { DatosTicket } from "./impresora.js";
import { ErrorBalanza } from "./balanza.js";

// ---------------------------------------------------------------------------
// Fixture de ticket mínimo para tests de impresora
// ---------------------------------------------------------------------------
function ticketDemo(): DatosTicket {
  const total = Money.desde("1850.00");
  return {
    razonSocial: "NexoSoft Almacén",
    cuit: "30-71234567-8",
    condicionIvaEmisor: "Responsable Inscripto",
    puntoDeVenta: 1,
    tipoComprobante: "Factura B",
    numero: 1,
    fecha: new Date("2026-06-26"),
    condicionIvaReceptor: "Consumidor Final",
    lineas: [
      {
        descripcion: "Gaseosa 1,5 L",
        cantidad: Cantidad.de("1"),
        precioUnitario: total,
        importe: total,
      },
    ],
    subtotalesIva: [
      {
        etiqueta: "IVA 21%",
        base: Money.desde("1528.93"),
        iva: Money.desde("321.07"),
      },
    ],
    descuento: Money.cero(),
    total,
    formasDePago: [{ etiqueta: "Efectivo", monto: total }],
    vuelto: Money.cero(),
  };
}

// ---------------------------------------------------------------------------
// MockImpresoraTermica
// ---------------------------------------------------------------------------
describe("MockImpresoraTermica", () => {
  let impresora: MockImpresoraTermica;

  beforeEach(() => {
    impresora = new MockImpresoraTermica();
  });

  it("imprime un ticket y lo registra en ticketsImpresos", async () => {
    const ticket = ticketDemo();
    await impresora.imprimirTicket(ticket);
    expect(impresora.ticketsImpresos).toHaveLength(1);
    expect(impresora.ticketsImpresos[0]).toBe(ticket);
  });

  it("acumula varios tickets", async () => {
    await impresora.imprimirTicket(ticketDemo());
    await impresora.imprimirTicket(ticketDemo());
    expect(impresora.ticketsImpresos).toHaveLength(2);
  });

  it("abre el cajón e incrementa el contador", async () => {
    await impresora.abrirCajon();
    await impresora.abrirCajon();
    expect(impresora.cajonesAbiertos).toBe(2);
  });

  it("verificarEstado devuelve ok:true por defecto", async () => {
    expect(await impresora.verificarEstado()).toEqual({ ok: true });
  });

  it("verificarEstado devuelve sin_papel cuando se configura", async () => {
    impresora.sinPapel = true;
    expect(await impresora.verificarEstado()).toEqual({ ok: false, razon: "sin_papel" });
  });

  it("verificarEstado devuelve sin_conexion cuando se configura", async () => {
    impresora.sinConexion = true;
    expect(await impresora.verificarEstado()).toEqual({ ok: false, razon: "sin_conexion" });
  });

  it("forzarError hace rechazar imprimirTicket", async () => {
    impresora.forzarError = true;
    await expect(impresora.imprimirTicket(ticketDemo())).rejects.toThrow();
  });

  it("forzarError hace rechazar abrirCajon", async () => {
    impresora.forzarError = true;
    await expect(impresora.abrirCajon()).rejects.toThrow();
  });

  it("resetear limpia el estado", async () => {
    await impresora.imprimirTicket(ticketDemo());
    impresora.forzarError = true;
    impresora.resetear();
    expect(impresora.ticketsImpresos).toHaveLength(0);
    expect(impresora.forzarError).toBe(false);
    await expect(impresora.imprimirTicket(ticketDemo())).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// MockLectorDeBarras
// ---------------------------------------------------------------------------
describe("MockLectorDeBarras", () => {
  let lector: MockLectorDeBarras;

  beforeEach(() => {
    lector = new MockLectorDeBarras();
  });

  it("notifica a un suscriptor cuando se simula un escaneo", () => {
    const codigos: string[] = [];
    lector.onEscaneo((c) => codigos.push(c));
    lector.simularEscaneo("7790001");
    expect(codigos).toEqual(["7790001"]);
  });

  it("notifica a múltiples suscriptores", () => {
    const a: string[] = [];
    const b: string[] = [];
    lector.onEscaneo((c) => a.push(c));
    lector.onEscaneo((c) => b.push(c));
    lector.simularEscaneo("7790002");
    expect(a).toEqual(["7790002"]);
    expect(b).toEqual(["7790002"]);
  });

  it("unsubscribe cancela las notificaciones", () => {
    const codigos: string[] = [];
    const unsub = lector.onEscaneo((c) => codigos.push(c));
    lector.simularEscaneo("AAA");
    unsub();
    lector.simularEscaneo("BBB");
    expect(codigos).toEqual(["AAA"]);
  });

  it("desconectar limpia los suscriptores", async () => {
    const codigos: string[] = [];
    lector.onEscaneo((c) => codigos.push(c));
    await lector.desconectar();
    lector.simularEscaneo("7790003");
    expect(codigos).toHaveLength(0);
  });

  it("cantidadSuscriptores refleja las suscripciones activas", () => {
    expect(lector.cantidadSuscriptores).toBe(0);
    const u1 = lector.onEscaneo(() => {});
    const u2 = lector.onEscaneo(() => {});
    expect(lector.cantidadSuscriptores).toBe(2);
    u1();
    expect(lector.cantidadSuscriptores).toBe(1);
    u2();
    expect(lector.cantidadSuscriptores).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// MockBalanza
// ---------------------------------------------------------------------------
describe("MockBalanza", () => {
  let balanza: MockBalanza;

  beforeEach(() => {
    balanza = new MockBalanza();
  });

  it("devuelve el peso simulado por defecto (1.000)", async () => {
    const peso = await balanza.leerPeso();
    expect(peso.aDecimalString(3)).toBe("1.000");
  });

  it("devuelve el peso configurado", async () => {
    balanza.pesoSimulado = Cantidad.de("0.350");
    const peso = await balanza.leerPeso();
    expect(peso.aDecimalString(3)).toBe("0.350");
  });

  it("tara incrementa el contador", async () => {
    await balanza.tarar();
    await balanza.tarar();
    expect(balanza.tarados).toBe(2);
  });

  it("verificarEstado devuelve ok:true por defecto", async () => {
    expect(await balanza.verificarEstado()).toEqual({ ok: true });
  });

  it("forzarError hace rechazar leerPeso con ErrorBalanza SIN_CONEXION", async () => {
    balanza.forzarError = true;
    await expect(balanza.leerPeso()).rejects.toBeInstanceOf(ErrorBalanza);
    try {
      await balanza.leerPeso();
    } catch (e) {
      expect((e as ErrorBalanza).codigo).toBe("SIN_CONEXION");
    }
  });

  it("forzarInestable hace rechazar leerPeso con ErrorBalanza PESO_INESTABLE", async () => {
    balanza.forzarInestable = true;
    try {
      await balanza.leerPeso();
    } catch (e) {
      expect((e as ErrorBalanza).codigo).toBe("PESO_INESTABLE");
    }
  });

  it("verificarEstado devuelve sin_conexion si forzarError", async () => {
    balanza.forzarError = true;
    expect(await balanza.verificarEstado()).toEqual({ ok: false, razon: "sin_conexion" });
  });

  it("resetear restaura el estado inicial", async () => {
    balanza.forzarError = true;
    balanza.tarados = 5;
    balanza.resetear();
    expect(balanza.forzarError).toBe(false);
    expect(balanza.tarados).toBe(0);
    const peso = await balanza.leerPeso();
    expect(peso.aDecimalString(3)).toBe("1.000");
  });
});
