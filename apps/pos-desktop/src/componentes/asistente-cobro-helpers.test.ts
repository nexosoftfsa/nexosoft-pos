import { FormaDePago, Money } from "@nexosoft/domain";
import { describe, expect, it } from "vitest";

import {
  moverCursor,
  montoBaseParaSaldoExacto,
  pasoTrasElegirMedio,
  pasoTrasElegirTarjeta,
  superaSaldoSinVuelto,
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
