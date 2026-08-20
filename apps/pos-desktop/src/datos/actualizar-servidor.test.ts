import { describe, it, expect } from "vitest";
import { esServidorLocal } from "./actualizar-servidor";

describe("esServidorLocal", () => {
  it("true para localhost", () => {
    expect(esServidorLocal("http://localhost:3000/api/v1")).toBe(true);
  });

  it("true para 127.0.0.1", () => {
    expect(esServidorLocal("http://127.0.0.1:3000/api/v1")).toBe(true);
  });

  it("false para una IP de la LAN (Depósito/Oficina)", () => {
    expect(esServidorLocal("http://192.168.0.10:3000/api/v1")).toBe(false);
  });

  it("false para un dominio remoto", () => {
    expect(esServidorLocal("https://panel.nexosoft.com.ar/api/v1")).toBe(false);
  });

  it("false para una URL inválida, sin tirar", () => {
    expect(esServidorLocal("no-es-una-url")).toBe(false);
  });
});
