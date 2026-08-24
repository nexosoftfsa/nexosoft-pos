import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";
import { ARGS_ACTUALIZAR_SERVIDOR, detalleDeSalida, esServidorLocal } from "./actualizar-servidor";

/**
 * El scope de `shell:allow-execute` fija los argumentos en tiempo de
 * compilación (ADR-0053): si el string de acá y el de las capabilities no son
 * idénticos, Tauri rechaza el comando y el botón falla en la PC del cliente —
 * no en desarrollo, porque en el navegador ni siquiera se ejecuta.
 */
describe("el comando coincide con el scope de Tauri", () => {
  it("los argumentos son idénticos a los de capabilities/default.json", () => {
    const ruta = join(
      dirname(fileURLToPath(import.meta.url)),
      "../../src-tauri/capabilities/default.json",
    );
    const capacidades = JSON.parse(readFileSync(ruta, "utf8")) as {
      permissions: Array<
        string | { identifier: string; allow?: Array<{ name: string; args: string[] }> }
      >;
    };
    const shell = capacidades.permissions.find(
      (p): p is { identifier: string; allow: Array<{ name: string; args: string[] }> } =>
        typeof p === "object" && p.identifier === "shell:allow-execute",
    );
    const comando = shell?.allow.find((a) => a.name === "actualizar-servidor");
    expect(comando, "falta el comando 'actualizar-servidor' en las capabilities").toBeDefined();
    expect(comando?.args).toEqual([...ARGS_ACTUALIZAR_SERVIDOR]);
  });

  it("contempla las dos formas de instalar el servidor", () => {
    const script = ARGS_ACTUALIZAR_SERVIDOR.join(" ");
    expect(script).toContain("C:\\NexoSoft-Servidor\\scripts\\actualizador-servidor.ps1");
    expect(script).toContain("C:\\NexoSoft\\scripts\\actualizacion\\actualizar-servidor.ps1");
  });
});

/**
 * Los códigos de salida son un contrato entre el script de PowerShell y el
 * POS, y viven en repos distintos del árbol. Si alguien agrega uno en el
 * script y se olvida del mensaje, la persona vuelve a ver un número pelado —
 * que es exactamente lo que pasó con el "código 1".
 */
describe("mensajes por código de salida", () => {
  const CODIGOS = [3, 4, 5, 6, 7, 8];

  it.each(CODIGOS)("el código %i tiene un mensaje propio, no un número", (codigo) => {
    const detalle = detalleDeSalida(codigo);
    expect(detalle).not.toContain(`código ${codigo}`);
    expect(detalle.length).toBeGreaterThan(40);
  });

  it("dice que el servidor está caído solo en el código 5", () => {
    expect(detalleDeSalida(5)).toContain("CAÍDO");
    for (const otro of CODIGOS.filter((c) => c !== 5)) {
      expect(detalleDeSalida(otro)).not.toContain("CAÍDO");
    }
  });

  it("aclara que no se perdió nada cuando se pudo revertir", () => {
    expect(detalleDeSalida(8)).toContain("No perdiste nada");
  });

  it("cae en un mensaje genérico con el número para un código desconocido", () => {
    expect(detalleDeSalida(42)).toContain("código 42");
    expect(detalleDeSalida(null)).toContain("desconocido");
  });

  it("cubre todos los códigos que define el script de PowerShell", () => {
    const script = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../../../scripts/instalacion/actualizador-servidor.ps1"),
      "utf8",
    );
    const definidos = [...script.matchAll(/^\$SALIDA_[A-Z_]+ = (\d+)/gm)].map((m) => Number(m[1]));
    expect(definidos.length).toBeGreaterThan(0);
    for (const codigo of definidos) {
      expect(detalleDeSalida(codigo), `falta el mensaje del código ${codigo}`).not.toContain(
        `código ${codigo}`,
      );
    }
  });
});

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
