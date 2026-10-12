import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import {
  arrancarPlazoDeGracia,
  dejarLimpiezaPendiente,
  GRACIA_MS,
  reiniciarLimpieza,
  saldarLimpieza,
} from "./limpieza-de-impresion";

beforeEach(() => {
  vi.useFakeTimers();
  reiniciarLimpieza();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("la limpieza no corre mientras el trabajo puede seguir en curso", () => {
  it("registrarla no la ejecuta", () => {
    const limpiar = vi.fn();
    dejarLimpiezaPendiente(limpiar);

    expect(limpiar).not.toHaveBeenCalled();
  });

  it("cerrar la vista previa TAMPOCO la ejecuta", () => {
    // Es el bug del 12/10/2026: `afterprint` se dispara al cerrar la vista
    // previa, cuando todavía falta guardar el PDF. Limpiar ahí colgó WebView2.
    const limpiar = vi.fn();
    dejarLimpiezaPendiente(limpiar);

    arrancarPlazoDeGracia();

    expect(limpiar).not.toHaveBeenCalled();
  });

  it("sigue sin correr un rato largo después de cerrar la vista previa", () => {
    const limpiar = vi.fn();
    dejarLimpiezaPendiente(limpiar);
    arrancarPlazoDeGracia();

    vi.advanceTimersByTime(GRACIA_MS - 1);

    expect(limpiar).not.toHaveBeenCalled();
  });
});

describe("cuándo sí se salda", () => {
  it("al empezar la impresión siguiente, que es la señal confiable", () => {
    const limpiarLaPrimera = vi.fn();
    dejarLimpiezaPendiente(limpiarLaPrimera);
    arrancarPlazoDeGracia();

    // Lo que hace `imprimir()` al arrancar.
    saldarLimpieza();

    expect(limpiarLaPrimera).toHaveBeenCalledTimes(1);
  });

  it("o sola, cumplido el plazo de gracia", () => {
    const limpiar = vi.fn();
    dejarLimpiezaPendiente(limpiar);
    arrancarPlazoDeGracia();

    vi.advanceTimersByTime(GRACIA_MS);

    expect(limpiar).toHaveBeenCalledTimes(1);
  });

  it("una sola vez, aunque se salde y además venza el plazo", () => {
    const limpiar = vi.fn();
    dejarLimpiezaPendiente(limpiar);
    arrancarPlazoDeGracia();

    saldarLimpieza();
    vi.advanceTimersByTime(GRACIA_MS * 2);

    expect(limpiar).toHaveBeenCalledTimes(1);
  });

  it("saldar sin nada pendiente no rompe", () => {
    expect(() => saldarLimpieza()).not.toThrow();
  });
});

describe("una sola limpieza pendiente para toda la app", () => {
  it("la impresión del A4 salda la que dejó la del ticket", () => {
    const limpiarTicket = vi.fn();
    dejarLimpiezaPendiente(limpiarTicket);
    arrancarPlazoDeGracia();

    // Arranca la del A4: primero salda, después registra la suya.
    saldarLimpieza();
    const limpiarA4 = vi.fn();
    dejarLimpiezaPendiente(limpiarA4);

    expect(limpiarTicket).toHaveBeenCalledTimes(1);
    expect(limpiarA4).not.toHaveBeenCalled();
  });

  it("el plazo de la impresión vieja no se lleva puesta a la nueva", () => {
    // Si el temporizador de la primera sobreviviera, limpiaría la segunda a
    // mitad de camino: exactamente el bug, con un minuto de retraso.
    dejarLimpiezaPendiente(vi.fn());
    arrancarPlazoDeGracia();

    saldarLimpieza();
    const limpiarLaNueva = vi.fn();
    dejarLimpiezaPendiente(limpiarLaNueva);
    vi.advanceTimersByTime(GRACIA_MS * 2);

    expect(limpiarLaNueva).not.toHaveBeenCalled();
  });
});
