import { describe, expect, it } from "vitest";

import { puedeAbrirAsistente, puedeArrancarVenta, type EstadoDeLaCaja } from "./venta-en-curso";

/** Caja lista para vender: hay carrito y no hay nada en curso. */
const LISTA: EstadoDeLaCaja = {
  carritoVacio: false,
  hayCobroElectronicoVigente: false,
  ventaEnCurso: false,
};

describe("puedeArrancarVenta", () => {
  it("con carrito y nada en curso, sí", () => {
    expect(puedeArrancarVenta(LISTA)).toBe(true);
  });

  it("sin carrito no hay venta que arrancar", () => {
    expect(puedeArrancarVenta({ ...LISTA, carritoVacio: true })).toBe(false);
  });

  /**
   * ADR-0075: cada Enter sobre el cartel de "esperando confirmación" abría un
   * cobro NUEVO, con su propio polling. De ahí salieron cientos de comprobantes.
   */
  it("con un cobro electrónico esperando al dispositivo, no", () => {
    expect(puedeArrancarVenta({ ...LISTA, hayCobroElectronicoVigente: true })).toBe(false);
  });

  /**
   * El caso del 17/9/2026, y la razón de que este módulo exista.
   *
   * Cuando el pago QR se aprueba, el polling se apaga —así que
   * `hayCobroElectronicoVigente` ya es false— y recién entonces arranca la
   * registración de la venta, que tarda hasta 8 segundos esperando a ARCA. Un
   * Enter en esa ventana pasaba los dos controles viejos y emitía una segunda
   * Factura B, con su CAE, por el mismo importe.
   */
  it("con el pago ya aprobado pero la venta todavía registrándose, TAMPOCO", () => {
    expect(
      puedeArrancarVenta({
        ...LISTA,
        hayCobroElectronicoVigente: false,
        ventaEnCurso: true,
      }),
    ).toBe(false);
  });
});

describe("puedeAbrirAsistente", () => {
  const base = { ...LISTA, yaAbierto: false, faltaParaFacturar: null };

  it("con la caja lista, sí", () => {
    expect(puedeAbrirAsistente(base)).toBe(true);
  });

  it("no se abre uno arriba del otro", () => {
    expect(puedeAbrirAsistente({ ...base, yaAbierto: true })).toBe(false);
  });

  /**
   * Una Factura A sin receptor no es una A incompleta: no es una A. El motivo
   * ya está a la vista en la cabecera y el asistente lo tapa, así que adentro
   * el Enter del último paso no hacía nada visible y parecía colgado.
   */
  it("no se abre sobre una venta que no se va a poder emitir", () => {
    expect(
      puedeAbrirAsistente({
        ...base,
        faltaParaFacturar: "Una Factura A necesita un cliente con CUIT.",
      }),
    ).toBe(false);
  });

  /**
   * El "$ 0,00 — Cobro completo" de la prueba del 16 y del 17/9/2026: el
   * carrito seguía en pantalla mientras la venta anterior terminaba, y un Enter
   * de más reabría el asistente sobre una venta que ya estaba cobrada.
   */
  it("no se abre mientras la venta anterior está terminando", () => {
    expect(puedeAbrirAsistente({ ...base, ventaEnCurso: true })).toBe(false);
  });

  it("tampoco con el carrito vacío: es de donde salía el $ 0,00", () => {
    expect(puedeAbrirAsistente({ ...base, carritoVacio: true })).toBe(false);
  });
});
