import { describe, expect, it } from "vitest";
import { codificarEan13, digitoVerificadorEan13 } from "./codigo-barras-ean13";

describe("digitoVerificadorEan13", () => {
  it("calcula el dígito verificador de un EAN-13 real conocido (ejemplo de GS1/Wikipedia)", () => {
    expect(digitoVerificadorEan13("400638133393")).toBe(1);
  });

  it("calcula el verificador de un código real del catálogo importado (Fase 10.2)", () => {
    // 7790310985113 — "3D QUESO 43GR", verificador conocido: 3.
    expect(digitoVerificadorEan13("779031098511")).toBe(3);
  });
});

describe("codificarEan13", () => {
  it("codifica 12 dígitos calculando el verificador", () => {
    const r = codificarEan13("400638133393");
    expect(r?.digitos).toBe("4006381333931");
    expect(r?.barras).toHaveLength(95);
    expect(r?.barras.startsWith("101")).toBe(true); // guarda de inicio
    expect(r?.barras.endsWith("101")).toBe(true); // guarda de fin
    expect(r?.barras.slice(45, 50)).toBe("01010"); // guarda central (3+42=45)
  });

  it("codifica 13 dígitos recalculando el verificador (ignora el dado)", () => {
    const r = codificarEan13("7790310985113");
    expect(r?.digitos).toBe("7790310985113");
  });

  it("solo barras: '0'/'1'", () => {
    const r = codificarEan13("7790310985113");
    expect(r?.barras).toMatch(/^[01]+$/);
  });

  it("códigos internos cortos (no EAN) devuelven null", () => {
    expect(codificarEan13("3")).toBeNull();
    expect(codificarEan13("26")).toBeNull();
    expect(codificarEan13("77917805")).toBeNull(); // 8 dígitos, EAN-8, no soportado acá
  });

  it("no numérico devuelve null", () => {
    expect(codificarEan13("ABC123456789")).toBeNull();
  });

  it("largo distinto de 12/13 devuelve null", () => {
    expect(codificarEan13("123456789012345")).toBeNull();
  });
});
