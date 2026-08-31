import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { esperarConTope } from "./esperar-con-tope";

describe("esperarConTope", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("devuelve el resultado si llega a tiempo", async () => {
    const r = await esperarConTope(Promise.resolve("con CAE"), 8000);
    expect(r).toBe("con CAE");
  });

  it("devuelve null si se pasa del tope", async () => {
    // Con ARCA lenta, el cajero no puede quedarse esperando con el cliente
    // adelante: sale el ticket "pendiente" y el CAE se consigue despues.
    const lento = new Promise<string>((res) => setTimeout(() => res("tarde"), 20_000));

    const promesa = esperarConTope(lento, 8_000);
    await vi.advanceTimersByTimeAsync(8_000);

    await expect(promesa).resolves.toBeNull();
  });

  it("NO cancela el trabajo al agotarse la espera", async () => {
    // Lo importante: abandonar la espera no es abandonar la venta. La
    // operacion sigue en la cola y el CAE se consigue igual.
    let termino = false;
    const lento = new Promise<string>((res) =>
      setTimeout(() => {
        termino = true;
        res("llego despues");
      }, 20_000),
    );

    const promesa = esperarConTope(lento, 8_000);
    await vi.advanceTimersByTimeAsync(8_000);
    await expect(promesa).resolves.toBeNull();
    expect(termino).toBe(false);

    await vi.advanceTimersByTimeAsync(12_000);
    await expect(lento).resolves.toBe("llego despues");
    expect(termino).toBe(true);
  });

  it("propaga el error si el trabajo falla antes del tope", async () => {
    await expect(
      esperarConTope(Promise.reject(new Error("sin red")), 8_000),
    ).rejects.toThrow("sin red");
  });
});
