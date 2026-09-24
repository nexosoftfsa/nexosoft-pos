import { afterEach, describe, expect, it, vi } from "vitest";

import { pedirTexto, preguntarSiNo } from "./dialogos";

/**
 * El 22/9/2026 F4 vaciaba la caja sin preguntar nada.
 *
 * `window.confirm` es sincrónico en un navegador, pero dentro de Tauri el
 * webview lo reemplaza por una versión que devuelve una PROMESA. Un
 * `if (!window.confirm(...))` escrito para el navegador evalúa esa promesa
 * —siempre verdadera— y sigue de largo. Lo mismo estaba pasando, sin que nadie
 * lo notara, en el botón "Descartar" de la cola de sincronización.
 */
describe("preguntarSiNo", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("en un navegador, donde confirm devuelve el booleano directo", async () => {
    vi.stubGlobal("confirm", () => true);
    expect(await preguntarSiNo("¿Seguro?")).toBe(true);

    vi.stubGlobal("confirm", () => false);
    expect(await preguntarSiNo("¿Seguro?")).toBe(false);
  });

  it("dentro de Tauri, donde confirm devuelve una promesa", async () => {
    vi.stubGlobal("confirm", () => Promise.resolve(true));
    expect(await preguntarSiNo("¿Seguro?")).toBe(true);

    // ÉSTE es el caso que rompía: sin esperar la promesa, el `if` la daba por
    // verdadera y la acción destructiva seguía adelante.
    vi.stubGlobal("confirm", () => Promise.resolve(false));
    expect(await preguntarSiNo("¿Seguro?")).toBe(false);
  });

  /** Ante cualquier otra cosa, NO. Una acción destructiva no se hace por las dudas. */
  it("con una respuesta que no es booleana, dice que no", async () => {
    vi.stubGlobal("confirm", () => undefined);
    expect(await preguntarSiNo("¿Seguro?")).toBe(false);
  });
});

describe("pedirTexto", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("devuelve el texto en los dos entornos", async () => {
    vi.stubGlobal("prompt", () => "2.5");
    expect(await pedirTexto("Cantidad:")).toBe("2.5");

    vi.stubGlobal("prompt", () => Promise.resolve("2.5"));
    expect(await pedirTexto("Cantidad:")).toBe("2.5");
  });

  it("cancelar devuelve null", async () => {
    vi.stubGlobal("prompt", () => null);
    expect(await pedirTexto("Cantidad:")).toBeNull();

    vi.stubGlobal("prompt", () => Promise.resolve(null));
    expect(await pedirTexto("Cantidad:")).toBeNull();
  });

  /** Mejor no hacer nada que tomar un objeto por lo que tecleó el cajero. */
  it("lo que no es texto se trata como cancelar", async () => {
    vi.stubGlobal("prompt", () => ({ raro: true }));
    expect(await pedirTexto("Cantidad:")).toBeNull();
  });
});
