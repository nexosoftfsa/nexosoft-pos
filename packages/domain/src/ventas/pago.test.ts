import { describe, expect, it } from "vitest";

import { ErrorPago } from "../comun/errores.js";
import { Money } from "../dinero/money.js";
import { calcularCobro, FormaDePago, totalPagado, type Pago } from "./pago.js";

const efectivo = (m: string): Pago => ({ forma: FormaDePago.Efectivo, monto: Money.desde(m) });
const tarjeta = (m: string): Pago => ({ forma: FormaDePago.Tarjeta, monto: Money.desde(m) });

describe("calcularCobro — pago exacto", () => {
  it("efectivo justo cancela sin vuelto", () => {
    const r = calcularCobro(Money.desde("1210.00"), [efectivo("1210.00")]);
    expect(r.cancelada).toBe(true);
    expect(r.vuelto.esCero()).toBe(true);
    expect(r.saldoPendiente.esCero()).toBe(true);
  });
});

describe("calcularCobro — vuelto en efectivo", () => {
  it("paga con $1500 sobre $1210 y recibe $290 de vuelto", () => {
    const r = calcularCobro(Money.desde("1210.00"), [efectivo("1500.00")]);
    expect(r.vuelto.aDecimalString()).toBe("290.00");
    expect(r.cancelada).toBe(true);
  });
});

describe("calcularCobro — pago combinado (varios medios)", () => {
  it("tarjeta + efectivo cubren el total", () => {
    const r = calcularCobro(Money.desde("1210.00"), [tarjeta("1000.00"), efectivo("210.00")]);
    expect(r.pagado.aDecimalString()).toBe("1210.00");
    expect(r.cancelada).toBe(true);
    expect(r.vuelto.esCero()).toBe(true);
  });

  it("permite vuelto si el excedente está cubierto por efectivo", () => {
    const r = calcularCobro(Money.desde("1210.00"), [tarjeta("1000.00"), efectivo("300.00")]);
    expect(r.vuelto.aDecimalString()).toBe("90.00");
  });

  it("rechaza dar vuelto cuando el excedente es de un pago electrónico", () => {
    expect(() => calcularCobro(Money.desde("1210.00"), [tarjeta("1300.00")])).toThrow(ErrorPago);
  });
});

describe("calcularCobro — saldo pendiente", () => {
  it("pago parcial deja saldo y no cancela", () => {
    const r = calcularCobro(Money.desde("1210.00"), [efectivo("500.00")]);
    expect(r.cancelada).toBe(false);
    expect(r.saldoPendiente.aDecimalString()).toBe("710.00");
    expect(r.vuelto.esCero()).toBe(true);
  });

  it("sin pagos, todo el total queda pendiente", () => {
    const r = calcularCobro(Money.desde("1210.00"), []);
    expect(r.cancelada).toBe(false);
    expect(r.saldoPendiente.aDecimalString()).toBe("1210.00");
  });
});

describe("calcularCobro — validaciones", () => {
  it("rechaza un pago de monto no positivo", () => {
    expect(() => calcularCobro(Money.desde("100.00"), [efectivo("0.00")])).toThrow(ErrorPago);
  });

  it("rechaza total negativo", () => {
    expect(() => calcularCobro(Money.desde("-1.00"), [])).toThrow(ErrorPago);
  });
});

describe("totalPagado", () => {
  it("suma los montos", () => {
    expect(totalPagado([efectivo("100.50"), tarjeta("99.50")]).aDecimalString()).toBe("200.00");
  });
});
