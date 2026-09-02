/**
 * El comando que corre el parche del antivirus está escrito DOS veces: acá en
 * el front (`ARGS_EXCLUIR_ANTIVIRUS`) y en la allowlist de Tauri
 * (`src-tauri/capabilities/default.json`). Tauri compara el pedido contra la
 * allowlist carácter por carácter: si se toca uno y no el otro, el botón deja
 * de funcionar en la app instalada y acá no se entera nadie.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { ARGS_EXCLUIR_ANTIVIRUS, detalleDeSalida } from "./excluir-antivirus";

interface Capabilities {
  readonly permissions: ReadonlyArray<
    string | { identifier: string; allow?: ReadonlyArray<{ name: string; args: string[] }> }
  >;
}

function argsDeLaAllowlist(nombre: string): string[] {
  const crudo = readFileSync(
    new URL("../../src-tauri/capabilities/default.json", import.meta.url),
    "utf8",
  );
  const caps = JSON.parse(crudo) as Capabilities;
  for (const permiso of caps.permissions) {
    if (typeof permiso === "string") continue;
    const entrada = permiso.allow?.find((a) => a.name === nombre);
    if (entrada) return entrada.args;
  }
  throw new Error(`No hay un comando "${nombre}" en la allowlist de Tauri`);
}

describe("el comando de exclusión del antivirus", () => {
  it("es idéntico al que autoriza Tauri", () => {
    expect(ARGS_EXCLUIR_ANTIVIRUS).toEqual(argsDeLaAllowlist("excluir-antivirus"));
  });

  /**
   * Regresión: la carpeta del POS es "NexoSoft POS", con espacio.
   * `Start-Process -ArgumentList` pega los argumentos con espacios y no
   * entrecomilla, así que sin las comillas el proceso elevado recibía
   * `-File C:\...\NexoSoft` y moría con -196608.
   */
  it("entrecomilla las rutas, que llevan espacio", () => {
    const comando = ARGS_EXCLUIR_ANTIVIRUS.join(" ");
    expect(comando).toContain("'-File',('\"'+$s+'\"')");
    expect(comando).toContain("'-CarpetaPos',('\"'+$pos+'\"')");
  });
});

describe("detalleDeSalida", () => {
  it("traduce los códigos que define el script", () => {
    expect(detalleDeSalida(2)).toContain("permiso de administrador");
    expect(detalleDeSalida(3)).toContain("Reinstalá");
    expect(detalleDeSalida(4)).toContain("no es Windows Defender");
  });

  it("para un código desconocido nombra el log", () => {
    expect(detalleDeSalida(-196608)).toContain("antivirus.log");
  });
});
