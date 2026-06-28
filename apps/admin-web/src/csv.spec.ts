import { describe, it, expect } from "vitest";
import { aCsv } from "./csv";

describe("aCsv", () => {
  it("une celdas con coma y filas con CRLF", () => {
    expect(aCsv([["a", "b"], ["c", "d"]])).toBe("a,b\r\nc,d");
  });

  it("entrecomilla celdas con coma, comillas o saltos de línea", () => {
    expect(aCsv([["x,y", 'di"jo', "linea1\nlinea2"]])).toBe(
      '"x,y","di""jo","linea1\nlinea2"',
    );
  });

  it("deja las celdas simples sin comillas", () => {
    expect(aCsv([["Coca Cola", "184"]])).toBe("Coca Cola,184");
  });
});
