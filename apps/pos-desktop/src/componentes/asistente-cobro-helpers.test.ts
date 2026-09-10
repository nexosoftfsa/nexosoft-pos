import { FormaDePago, Money } from "@nexosoft/domain";
import { describe, expect, it } from "vitest";

import {
  accionImpresionDe,
  moverCursor,
  montoBaseParaSaldoExacto,
  OPCIONES_IMPRESION,
  pasoTrasElegirMedio,
  pasoTrasElegirTarjeta,
  superaSaldoSinVuelto,
  volverPasoAtras,
} from "./asistente-cobro-helpers";

describe("moverCursor", () => {
  it("avanza dentro de la lista", () => {
    expect(moverCursor(0, 1, 4)).toBe(1);
  });
  it("da la vuelta al pasarse del final", () => {
    expect(moverCursor(3, 1, 4)).toBe(0);
  });
  it("da la vuelta al pasarse del principio", () => {
    expect(moverCursor(0, -1, 4)).toBe(3);
  });
  it("con lista vacía no rompe", () => {
    expect(moverCursor(0, 1, 0)).toBe(0);
  });
});

describe("pasoTrasElegirMedio", () => {
  it("Tarjeta con tarjetas configuradas va a elegir tarjeta", () => {
    expect(pasoTrasElegirMedio(FormaDePago.Tarjeta, 2, 0, false)).toBe("tarjeta");
  });
  it("Tarjeta sin tarjetas configuradas va directo al monto", () => {
    expect(pasoTrasElegirMedio(FormaDePago.Tarjeta, 0, 0, false)).toBe("monto");
  });
  it("Cuenta corriente con clientes y sin elegir uno pide cliente", () => {
    expect(pasoTrasElegirMedio(FormaDePago.CuentaCorriente, 0, 3, false)).toBe("cliente");
  });
  it("Cuenta corriente con cliente ya elegido va directo al monto", () => {
    expect(pasoTrasElegirMedio(FormaDePago.CuentaCorriente, 0, 3, true)).toBe("monto");
  });
  it("Cuenta corriente sin clientes cargados va directo al monto", () => {
    expect(pasoTrasElegirMedio(FormaDePago.CuentaCorriente, 0, 0, false)).toBe("monto");
  });
  it("Efectivo va directo al monto", () => {
    expect(pasoTrasElegirMedio(FormaDePago.Efectivo, 2, 3, false)).toBe("monto");
  });
});

describe("pasoTrasElegirTarjeta", () => {
  it("con tasas cargadas pide cuotas", () => {
    expect(pasoTrasElegirTarjeta(3)).toBe("cuotas");
  });
  it("sin tasas cargadas va directo al monto", () => {
    expect(pasoTrasElegirTarjeta(0)).toBe("monto");
  });
});

describe("volverPasoAtras", () => {
  it("sin historial, cierra el asistente", () => {
    expect(volverPasoAtras([])).toEqual({ paso: "cerrado", historial: [] });
  });
  it("vuelve al último paso recorrido y lo saca del historial", () => {
    expect(volverPasoAtras(["medio", "tarjeta", "cuotas"])).toEqual({
      paso: "cuotas",
      historial: ["medio", "tarjeta"],
    });
  });
  it("deshace el camino completo de tarjeta a cuotas paso por paso", () => {
    let estado = volverPasoAtras(["medio", "tarjeta", "cuotas"]);
    expect(estado.paso).toBe("cuotas");
    estado = volverPasoAtras(estado.historial);
    expect(estado.paso).toBe("tarjeta");
    estado = volverPasoAtras(estado.historial);
    expect(estado.paso).toBe("medio");
    estado = volverPasoAtras(estado.historial);
    expect(estado.paso).toBe("cerrado");
  });
  it("no muta el historial recibido", () => {
    const historial = ["medio", "cliente"] as const;
    volverPasoAtras(historial);
    expect(historial).toEqual(["medio", "cliente"]);
  });
});

describe("montoBaseParaSaldoExacto", () => {
  it("sin recargo, la base es el saldo pendiente", () => {
    const saldo = Money.desde("15100");
    expect(montoBaseParaSaldoExacto(saldo, 0).aDecimalString(2)).toBe(saldo.aDecimalString(2));
  });
  it("con recargo, descuenta la tasa para que base + recargo cierre el saldo", () => {
    const saldo = Money.desde("11000");
    const base = montoBaseParaSaldoExacto(saldo, 10);
    const recargo = base.porcentaje(10);
    expect(base.sumar(recargo).aDecimalString(2)).toBe("11000.00");
  });
});

describe("superaSaldoSinVuelto", () => {
  it("efectivo nunca supera (admite vuelto)", () => {
    expect(superaSaldoSinVuelto(FormaDePago.Efectivo, Money.desde("20000"), Money.desde("15100"))).toBe(
      false,
    );
  });
  it("tarjeta por encima del saldo no admite vuelto", () => {
    expect(superaSaldoSinVuelto(FormaDePago.Tarjeta, Money.desde("15200"), Money.desde("15100"))).toBe(
      true,
    );
  });
  it("tarjeta por el saldo exacto no supera", () => {
    expect(superaSaldoSinVuelto(FormaDePago.Tarjeta, Money.desde("15100"), Money.desde("15100"))).toBe(
      false,
    );
  });
  it("tarjeta por debajo del saldo (pago parcial) no supera", () => {
    expect(superaSaldoSinVuelto(FormaDePago.Tarjeta, Money.desde("5000"), Money.desde("15100"))).toBe(
      false,
    );
  });
});

/**
 * El A4 se agregó el 10/9/2026: cerrando la venta por el asistente —o sea,
 * siempre— no había forma de sacar el A4 ORIGINAL. El único A4 posible era una
 * reimpresión desde Comprobantes, que sale marcada DUPLICADO.
 */
describe("accionImpresionDe", () => {
  it("las tres filas hacen las tres cosas", () => {
    expect(accionImpresionDe(0)).toBe("ticket");
    expect(accionImpresionDe(1)).toBe("a4");
    expect(accionImpresionDe(2)).toBe("ninguna");
  });

  /**
   * "No imprimir" es la salida segura ante un cursor fuera de rango: imprimir
   * de más gasta papel, pero un A4 inesperado abre el diálogo del sistema y
   * traba la caja con el cliente adelante.
   */
  it("fuera de rango no imprime nada", () => {
    expect(accionImpresionDe(3)).toBe("ninguna");
    expect(accionImpresionDe(-1)).toBe("ninguna");
  });

  it("las etiquetas y las acciones no se desfasan", () => {
    expect(OPCIONES_IMPRESION.map((o) => o.accion)).toEqual(
      OPCIONES_IMPRESION.map((_, i) => accionImpresionDe(i)),
    );
  });

  it("el cursor da la vuelta sobre las tres opciones", () => {
    expect(moverCursor(2, 1, OPCIONES_IMPRESION.length)).toBe(0);
  });
});
