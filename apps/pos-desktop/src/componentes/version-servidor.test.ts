import { describe, it, expect } from "vitest";
import { textoVersionServidor } from "./Actualizaciones";

describe("textoVersionServidor", () => {
  it("muestra la versión publicada del servidor", () => {
    expect(
      textoVersionServidor({ tipo: "ok", salud: { status: "ok", db: "ok", version: "0.8.1" } }),
    ).toBe("0.8.1");
  });

  it("mientras no se sabe, no inventa nada", () => {
    expect(textoVersionServidor(null)).toBe("…");
  });

  it("dice que no responde en vez de quedarse cargando para siempre", () => {
    expect(textoVersionServidor({ tipo: "sin-conexion" })).toBe("no responde");
  });

  it("explica un servidor corriendo desde el código, que en un comercio no debería pasar", () => {
    const r = textoVersionServidor({
      tipo: "ok",
      salud: { status: "ok", db: "ok", version: "dev" },
    });
    expect(r).toContain("sin versión");
  });

  it("muestra el error tal cual si el servidor contestó mal", () => {
    expect(textoVersionServidor({ tipo: "error", mensaje: "El servidor respondió 500." })).toBe(
      "El servidor respondió 500.",
    );
  });
});
