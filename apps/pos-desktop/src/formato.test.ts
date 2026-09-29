import { describe, expect, it } from "vitest";

import { Money } from "@nexosoft/domain";

import {
  digitosHasta,
  formatearImporteTecleado,
  importeParaEditar,
  importeTecleado,
  pesos,
  posicionTrasDigitos,
} from "./formato";

describe("pesos", () => {
  it("formatea al estilo argentino", () => {
    expect(pesos(Money.desde("1850"))).toBe("$ 1.850,00");
    expect(pesos(Money.desde("11450.5"))).toBe("$ 11.450,50");
    expect(pesos(Money.desde("-741.14"))).toBe("-$ 741,14");
  });
});

/**
 * El campo de monto del asistente mostraba el saldo crudo —"11450.00"— y a
 * simple vista 10000 y 1000 se parecen demasiado. Sebastián tuvo que contar
 * los ceros para no errarle, en el campo donde el cajero confirma cuánta plata
 * entra.
 */
describe("importeParaEditar", () => {
  it("lleva separadores de miles y coma decimal, sin el signo", () => {
    expect(importeParaEditar(Money.desde("11450"))).toBe("11.450,00");
    expect(importeParaEditar(Money.desde("1000"))).toBe("1.000,00");
    expect(importeParaEditar(Money.desde("10000"))).toBe("10.000,00");
  });

  it("un importe chico sale sin puntos", () => {
    expect(importeParaEditar(Money.desde("850.5"))).toBe("850,50");
  });
});

describe("importeTecleado", () => {
  /** Lo que devuelve `importeParaEditar` tiene que poder volver a entrar. */
  it("entiende el formato es-AR que muestra el campo", () => {
    expect(importeTecleado("11.450,00")).toBe("11450.00");
    expect(Money.desde(importeTecleado("11.450,00")).aDecimalString(2)).toBe("11450.00");
  });

  it("sigue aceptando lo crudo, que es lo que teclea la mayoría", () => {
    expect(importeTecleado("11450.00")).toBe("11450.00");
    expect(importeTecleado(" 850 ")).toBe("850");
  });

  /**
   * Sin coma, un punto es el separador decimal y NO se toca. Sacarlo siempre
   * convertiría "1.50" en 150: cien veces de más en la caja.
   */
  it("sin coma, el punto es decimal y se respeta", () => {
    expect(Money.desde(importeTecleado("1.50")).aDecimalString(2)).toBe("1.50");
  });

  it("con coma, los puntos son de miles", () => {
    expect(Money.desde(importeTecleado("1.234.567,89")).aDecimalString(2)).toBe("1234567.89");
  });

  /**
   * Desde que el campo separa los miles mientras se teclea, esto es lo que hay
   * escrito cuando el cajero aprieta Enter. Leerlo como veinte pesos sería
   * cobrar de menos.
   */
  it("sin coma, un punto con tres dígitos atrás son miles", () => {
    expect(Money.desde(importeTecleado("20.000")).aDecimalString(2)).toBe("20000.00");
    expect(Money.desde(importeTecleado("1.450")).aDecimalString(2)).toBe("1450.00");
    expect(Money.desde(importeTecleado("1.234.567")).aDecimalString(2)).toBe("1234567.00");
  });
});

/**
 * *"Quise colocar un billete de $ 2.000 y puse $ 20.000 porque ya estoy
 * cansado (…) no puedo contar los ceros sin un separador automático de miles
 * mientras tipeo"* — Sebastián, 26/9/2026. Eso es un billete de diferencia en
 * la caja por no poder leer lo que uno mismo acaba de escribir.
 */
describe("formatearImporteTecleado", () => {
  it("separa los miles a medida que entran los dígitos", () => {
    expect(formatearImporteTecleado("2")).toBe("2");
    expect(formatearImporteTecleado("20")).toBe("20");
    expect(formatearImporteTecleado("200")).toBe("200");
    expect(formatearImporteTecleado("2000")).toBe("2.000");
    expect(formatearImporteTecleado("20000")).toBe("20.000");
    expect(formatearImporteTecleado("1234567")).toBe("1.234.567");
  });

  it("reformatea lo que ya tenía puntos, sin duplicarlos", () => {
    expect(formatearImporteTecleado("20.000")).toBe("20.000");
    // Un dígito más sobre "2.000": los puntos se recalculan de cero.
    expect(formatearImporteTecleado("2.0005")).toBe("20.005");
  });

  /** La coma sola es alguien a mitad de camino de escribir los centavos. */
  it("conserva la coma y corta en dos decimales", () => {
    expect(formatearImporteTecleado("1450,")).toBe("1.450,");
    expect(formatearImporteTecleado("1450,5")).toBe("1.450,5");
    expect(formatearImporteTecleado("1450,50")).toBe("1.450,50");
    expect(formatearImporteTecleado("1450,5099")).toBe("1.450,50");
  });

  it("ignora lo que no sea dígito o coma", () => {
    expect(formatearImporteTecleado("$ 1.450,00 ")).toBe("1.450,00");
    expect(formatearImporteTecleado("abc")).toBe("");
    expect(formatearImporteTecleado("")).toBe("");
  });

  /** Sin esto, "0" más un dígito quedaba en "05". */
  it("saca los ceros de la izquierda", () => {
    expect(formatearImporteTecleado("05")).toBe("5");
    expect(formatearImporteTecleado("0")).toBe("0");
    expect(formatearImporteTecleado("0,50")).toBe("0,50");
  });

  /** Y el resultado tiene que poder volver a entrar. */
  it("lo que sale se puede volver a leer", () => {
    const enPantalla = formatearImporteTecleado("20000");
    expect(Money.desde(importeTecleado(enPantalla)).aDecimalString(2)).toBe("20000.00");
  });
});

/**
 * Los puntos que se insertan corren el texto: si el cursor se repusiera por
 * posición de carácter, tipear en el medio de un importe lo mandaría a saltar.
 * Se cuenta por dígitos, que es lo único que no cambia.
 */
describe("cursor del campo de monto", () => {
  it("cuenta dígitos, no caracteres", () => {
    expect(digitosHasta("1.450,00", 5)).toBe(4);
    expect(digitosHasta("1.450,00", 0)).toBe(0);
    expect(digitosHasta("1.450,00", 8)).toBe(6);
  });

  it("vuelve a la posición que sigue al dígito n", () => {
    expect(posicionTrasDigitos("1.450,00", 0)).toBe(0);
    expect(posicionTrasDigitos("1.450,00", 1)).toBe(1);
    expect(posicionTrasDigitos("1.450,00", 4)).toBe(5);
    expect(posicionTrasDigitos("1.450,00", 99)).toBe(8);
  });

  /** Tipear un "0" al final de "2.000" deja el cursor al final de "20.000". */
  it("sobrevive a que el formateo agregue un punto", () => {
    const crudo = "2.0000";
    const digitos = digitosHasta(crudo, crudo.length);
    const despues = formatearImporteTecleado(crudo);
    expect(despues).toBe("20.000");
    expect(posicionTrasDigitos(despues, digitos)).toBe(6);
  });
});
