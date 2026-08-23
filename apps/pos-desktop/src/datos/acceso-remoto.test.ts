import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";
import {
  ARGS_ACTIVAR_ACCESO_REMOTO,
  ARGS_DESACTIVAR_ACCESO_REMOTO,
  ARGS_REACTIVAR_ACCESO_REMOTO,
  VALIDADOR_CODIGO,
  hostnameDelCodigo,
  validarCodigoActivacion,
} from "./acceso-remoto";

function codigoDe(datos: unknown): string {
  return btoa(JSON.stringify(datos));
}

const CODIGO_VALIDO = codigoDe({
  hostname: "lagus.nexosoft.com.ar",
  token: "eyJhIjoiMTIzNCIsInQiOiJhYmNkIiwicyI6Inh4eCJ9",
});

/**
 * Igual que con "actualizar-servidor" (ADR-0053): si los argumentos de acá y
 * los del scope de Tauri no son idénticos, el comando se rechaza en la PC del
 * cliente y no en desarrollo, donde ni siquiera se ejecuta.
 */
describe("los comandos coinciden con el scope de Tauri", () => {
  const ruta = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../src-tauri/capabilities/default.json",
  );
  const capacidades = JSON.parse(readFileSync(ruta, "utf8")) as {
    permissions: Array<
      | string
      | {
          identifier: string;
          allow?: Array<{ name: string; args: Array<string | { validator: string }> }>;
        }
    >;
  };
  const shell = capacidades.permissions.find(
    (
      p,
    ): p is {
      identifier: string;
      allow: Array<{ name: string; args: Array<string | { validator: string }> }>;
    } => typeof p === "object" && p.identifier === "shell:allow-execute",
  );

  it.each([
    ["acceso-remoto-activar", ARGS_ACTIVAR_ACCESO_REMOTO],
    ["acceso-remoto-reactivar", ARGS_REACTIVAR_ACCESO_REMOTO],
    ["acceso-remoto-desactivar", ARGS_DESACTIVAR_ACCESO_REMOTO],
  ])("%s tiene los mismos argumentos que las capabilities", (nombre, args) => {
    const comando = shell?.allow.find((a) => a.name === nombre);
    expect(comando, `falta el comando '${nombre}' en las capabilities`).toBeDefined();
    expect(comando?.args).toEqual([...args]);
  });

  it("el único dato dinámico es el código, y solo acepta base64", () => {
    const dinamicos = ARGS_ACTIVAR_ACCESO_REMOTO.filter((a) => typeof a !== "string");
    expect(dinamicos).toEqual([{ validator: VALIDADOR_CODIGO }]);
    // Nada que pueda cerrar la comilla simple o encadenar otro comando.
    for (const peligroso of ["'", '"', ";", "$", "`", " ", "&", "|", "\n"]) {
      expect(new RegExp(VALIDADOR_CODIGO).test(`abcdefghij1234567890${peligroso}`)).toBe(false);
    }
  });

  it("contempla las dos formas de instalar el servidor", () => {
    const script = ARGS_REACTIVAR_ACCESO_REMOTO.join(" ");
    expect(script).toContain("C:\\NexoSoft-Servidor\\scripts\\instalar-acceso-remoto.ps1");
    expect(script).toContain("C:\\NexoSoft\\scripts\\instalacion\\instalar-acceso-remoto.ps1");
  });
});

describe("validarCodigoActivacion", () => {
  it("acepta un código bien formado", () => {
    expect(validarCodigoActivacion(CODIGO_VALIDO)).toBeNull();
  });

  it("acepta un código con espacios alrededor (pegado desde WhatsApp)", () => {
    expect(validarCodigoActivacion(`  ${CODIGO_VALIDO}  `)).toBeNull();
  });

  it("pide el código si está vacío", () => {
    expect(validarCodigoActivacion("   ")).toContain("Pegá el código");
  });

  it("rechaza texto que no es base64", () => {
    expect(validarCodigoActivacion("esto no es un código!!")).toContain("formato esperado");
  });

  it("rechaza un código que no apunta a un dominio de NexoSoft", () => {
    const ajeno = codigoDe({ hostname: "lagus.otrodominio.com", token: "abc" });
    expect(validarCodigoActivacion(ajeno)).toContain("NexoSoft");
  });

  it("rechaza un subdominio de segundo nivel (no lo cubre el certificado)", () => {
    const profundo = codigoDe({ hostname: "panel.lagus.nexosoft.com.ar", token: "abc" });
    expect(validarCodigoActivacion(profundo)).toContain("NexoSoft");
  });

  it("rechaza un código sin token", () => {
    const sinToken = codigoDe({ hostname: "lagus.nexosoft.com.ar", token: "" });
    expect(validarCodigoActivacion(sinToken)).toContain("incompleto");
  });

  it("rechaza base64 que no contiene JSON", () => {
    expect(validarCodigoActivacion(btoa("no soy json, soy un texto cualquiera"))).toContain(
      "no se pudo leer",
    );
  });
});

describe("hostnameDelCodigo", () => {
  it("devuelve la dirección para mostrarla antes de activar", () => {
    expect(hostnameDelCodigo(CODIGO_VALIDO)).toBe("lagus.nexosoft.com.ar");
  });

  it("devuelve null si el código no sirve", () => {
    expect(hostnameDelCodigo("cualquier cosa")).toBeNull();
  });
});
