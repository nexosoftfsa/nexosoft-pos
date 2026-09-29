import { afterEach, describe, expect, it, vi } from "vitest";

import {
  hayDialogoAbierto,
  pedirTexto,
  preguntarSiNo,
  registrarDialogos,
  type PedidoDialogo,
} from "./dialogos";

/**
 * Lo de abajo es el camino de respaldo: los diálogos del navegador, que es lo
 * que se usa en el modo demo y en los tests. En la app instalada pregunta
 * `componentes/Dialogos.tsx` — ver el bloque del final.
 *
 * El 22/9/2026 F4 vaciaba la caja sin preguntar nada: `window.confirm` es
 * sincrónico en un navegador, pero dentro de Tauri devolvía una PROMESA, y un
 * `if (!window.confirm(...))` la daba por verdadera y seguía de largo. Lo mismo
 * pasaba en el botón "Descartar" de la cola de sincronización.
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

/**
 * Con el diálogo de la app montado, el del webview no se toca. Es el camino que
 * corre en la PC del comercio, y el que hizo falta cuando el reemplazo de Tauri
 * dejó de contestar del todo: el 26/9/2026 F4 no hacía absolutamente nada
 * —*"aprieto y no sale nada"*— (ADR-0084).
 */
describe("con Dialogos montado", () => {
  afterEach(() => {
    registrarDialogos(null);
    vi.unstubAllGlobals();
  });

  it("pregunta por la app y ni mira el confirm del navegador", async () => {
    const delNavegador = vi.fn(() => true);
    vi.stubGlobal("confirm", delNavegador);
    const pedidos: PedidoDialogo[] = [];
    registrarDialogos(async (p) => {
      pedidos.push(p);
      return false;
    });

    expect(await preguntarSiNo("¿Cancelar la venta?")).toBe(false);
    expect(delNavegador).not.toHaveBeenCalled();
    expect(pedidos).toEqual([{ tipo: "confirmar", mensaje: "¿Cancelar la venta?" }]);
  });

  it("pedirTexto pasa el valor inicial y devuelve lo tecleado", async () => {
    const pedidos: PedidoDialogo[] = [];
    registrarDialogos(async (p) => {
      pedidos.push(p);
      return "2.5";
    });

    expect(await pedirTexto("Nueva cantidad:", "1")).toBe("2.5");
    expect(pedidos[0]).toEqual({ tipo: "texto", mensaje: "Nueva cantidad:", valorInicial: "1" });
  });

  /**
   * Los listeners globales de teclado lo consultan: mientras se pregunta algo,
   * el Escape es del diálogo y no del panel que quedó atrás.
   */
  it("avisa que hay una pregunta abierta, y sólo mientras lo está", async () => {
    expect(hayDialogoAbierto()).toBe(false);

    let responder: ((r: boolean) => void) | null = null;
    registrarDialogos(() => new Promise<boolean>((r) => (responder = r)));
    const pregunta = preguntarSiNo("¿Seguro?");
    expect(hayDialogoAbierto()).toBe(true);

    (responder as unknown as (r: boolean) => void)(true);
    expect(await pregunta).toBe(true);
    expect(hayDialogoAbierto()).toBe(false);
  });

  /** Si la pregunta se cae, no se queda trabado el teclado de toda la app. */
  it("un error al preguntar no deja el candado puesto", async () => {
    registrarDialogos(() => Promise.reject(new Error("se rompió")));
    await expect(preguntarSiNo("¿Seguro?")).rejects.toThrow("se rompió");
    expect(hayDialogoAbierto()).toBe(false);
  });
});
