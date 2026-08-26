import { describe, expect, it } from "vitest";

import { cuitEsValido, formatearCuit, normalizarCuit } from "./cuit.js";

describe("normalizarCuit", () => {
  it("saca guiones, espacios y puntos", () => {
    expect(normalizarCuit("20-35678007-9")).toBe("20356780079");
    expect(normalizarCuit("20 35678007 9")).toBe("20356780079");
    expect(normalizarCuit("20.35678007.9")).toBe("20356780079");
  });

  it("deja intacto lo que ya son puros dígitos", () => {
    expect(normalizarCuit("20356780079")).toBe("20356780079");
  });
});

describe("cuitEsValido", () => {
  it("acepta CUITs reales, con y sin guiones", () => {
    expect(cuitEsValido("20-35678007-9")).toBe(true);
    expect(cuitEsValido("20356780079")).toBe(true);
    // Persona jurídica (prefijo 30) y mujer (prefijo 27).
    expect(cuitEsValido("30-71234567-1")).toBe(true);
    expect(cuitEsValido("27-12345678-0")).toBe(true);
  });

  it("rechaza un dígito verificador equivocado", () => {
    // El mismo CUIT de arriba con el último dígito cambiado.
    expect(cuitEsValido("20-35678007-1")).toBe(false);
    expect(cuitEsValido("20-35678007-0")).toBe(false);
  });

  it("rechaza largos que no sean 11 dígitos", () => {
    expect(cuitEsValido("2035678007")).toBe(false);
    expect(cuitEsValido("203567800790")).toBe(false);
    expect(cuitEsValido("")).toBe(false);
  });

  it("rechaza texto que no sean dígitos", () => {
    expect(cuitEsValido("20-ABCDEFGH-9")).toBe(false);
    expect(cuitEsValido("no es un cuit")).toBe(false);
  });

  it("acepta el caso donde el verificador da 0", () => {
    // La suma de 27-12345678 es múltiplo de 11, así que 11 - 0 = 11 y el
    // algoritmo tiene que convertirlo en 0. Es el caso que más se rompe al
    // implementar esto de memoria.
    expect(cuitEsValido("27-12345678-0")).toBe(true);
    expect(cuitEsValido("27-12345678-1")).toBe(false);
  });

  it("acepta un CUIT de sociedad (prefijo 33)", () => {
    expect(cuitEsValido("33-69345023-9")).toBe(true);
  });
});

describe("formatearCuit", () => {
  it("arma el formato con guiones", () => {
    expect(formatearCuit("20356780079")).toBe("20-35678007-9");
  });

  it("devuelve lo que le dieron si no son 11 dígitos", () => {
    expect(formatearCuit("123")).toBe("123");
  });
});
