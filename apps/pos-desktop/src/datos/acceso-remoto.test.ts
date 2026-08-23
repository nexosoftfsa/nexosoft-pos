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

/**
 * Forma real del código que genera
 * `scripts/release/generar-codigo-acceso-remoto.ps1`: el hostname del
 * comercio más las credenciales de su túnel, que es lo que la PC necesita
 * para levantarlo sin cuenta de Cloudflare propia.
 */
const CODIGO_VALIDO = codigoDe({
  hostname: "lagus.nexosoft.com.ar",
  tunnelId: "6ff42ae2-765d-4adf-8112-31c55c1551ef",
  credenciales: {
    AccountTag: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
    TunnelID: "6ff42ae2-765d-4adf-8112-31c55c1551ef",
    TunnelName: "nexosoft-lagus",
    TunnelSecret: "AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA=",
  },
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
    const ajeno = codigoDe({
      hostname: "lagus.otrodominio.com",
      tunnelId: "abc",
      credenciales: { TunnelSecret: "xyz" },
    });
    expect(validarCodigoActivacion(ajeno)).toContain("NexoSoft");
  });

  it("rechaza un subdominio de segundo nivel (no lo cubre el certificado)", () => {
    const profundo = codigoDe({
      hostname: "panel.lagus.nexosoft.com.ar",
      tunnelId: "abc",
      credenciales: { TunnelSecret: "xyz" },
    });
    expect(validarCodigoActivacion(profundo)).toContain("NexoSoft");
  });

  it("rechaza un código sin las credenciales del túnel", () => {
    const sinCredenciales = codigoDe({ hostname: "lagus.nexosoft.com.ar", tunnelId: "abc" });
    expect(validarCodigoActivacion(sinCredenciales)).toContain("incompleto");
  });

  it("rechaza un código sin el id del túnel", () => {
    const sinId = codigoDe({
      hostname: "lagus.nexosoft.com.ar",
      credenciales: { TunnelSecret: "xyz" },
    });
    expect(validarCodigoActivacion(sinId)).toContain("incompleto");
  });

  /**
   * Fase 17.B (ADR-0056 §6): un solo código por comercio, que puede traer la
   * suscripción, el acceso remoto, o las dos cosas.
   */
  describe("código unificado", () => {
    it("acepta un código que trae suscripción y acceso remoto", () => {
      const completo = codigoDe({
        comercioId: "lagus",
        hostname: "lagus.nexosoft.com.ar",
        tunnelId: "6ff42ae2-765d-4adf-8112-31c55c1551ef",
        credenciales: { TunnelSecret: "AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA=" },
      });
      expect(validarCodigoActivacion(completo)).toBeNull();
    });

    it("acepta un código de SOLO suscripción, sin túnel", () => {
      // El comercio que no contrató acceso remoto igual tiene suscripción.
      expect(validarCodigoActivacion(codigoDe({ comercioId: "kiosco" }))).toBeNull();
    });

    it("en un código sin túnel no hay dirección que mostrar", () => {
      expect(hostnameDelCodigo(codigoDe({ comercioId: "kiosco" }))).toBeNull();
    });

    it("sigue aceptando los códigos viejos, que sólo traían el túnel", () => {
      expect(validarCodigoActivacion(CODIGO_VALIDO)).toBeNull();
    });

    it("rechaza un código que no trae ni comercio ni túnel", () => {
      expect(validarCodigoActivacion(codigoDe({ otraCosa: 1 }))).toContain("incompleto");
    });

    it("si trae túnel a medias, lo rechaza aunque tenga comercio", () => {
      const aMedias = codigoDe({ comercioId: "lagus", hostname: "lagus.nexosoft.com.ar" });
      expect(validarCodigoActivacion(aMedias)).toContain("incompleto");
    });
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
