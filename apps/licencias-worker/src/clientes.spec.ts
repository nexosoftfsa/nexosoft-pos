import { describe, it, expect, beforeEach } from "vitest";
import {
  esEstadoValido,
  licenciaDe,
  permitirBloqueo,
  soloFecha,
  TOPE_BLOQUEOS_DIARIOS,
  type Cliente,
} from "./clientes";

const CLIENTE: Cliente = {
  comercioId: "lagus",
  nombre: "Lagus Minimarket",
  estado: "ACTIVA",
  vencePagoEl: "2026-09-10",
  mensaje: null,
  creadoEn: "2026-08-01T00:00:00Z",
};

/** KV de mentira: alcanza con get/put para lo que se prueba acá. */
function kvFalso() {
  const datos = new Map<string, string>();
  return {
    datos,
    get: (k: string) => Promise.resolve(datos.get(k) ?? null),
    put: (k: string, v: string) => {
      datos.set(k, v);
      return Promise.resolve();
    },
  } as unknown as KVNamespace;
}

describe("licenciaDe", () => {
  const ahora = new Date("2026-08-23T12:00:00Z");

  it("arma la licencia con el estado del cliente", () => {
    const lic = licenciaDe(CLIENTE, ahora);
    expect(lic.comercioId).toBe("lagus");
    expect(lic.estado).toBe("ACTIVA");
    expect(lic.vencePagoEl).toBe("2026-09-10");
  });

  it("el token vale 7 días: suficiente para aguantar sin internet, poco para que un cambio llegue rápido", () => {
    const lic = licenciaDe(CLIENTE, ahora);
    const dias = (new Date(lic.validaHasta).getTime() - ahora.getTime()) / 86_400_000;
    expect(dias).toBe(7);
  });

  it("lleva el mensaje del panel cuando hay uno", () => {
    const lic = licenciaDe({ ...CLIENTE, mensaje: "Pagá antes del viernes" }, ahora);
    expect(lic.mensaje).toBe("Pagá antes del viernes");
  });
});

describe("permitirBloqueo (válvula de seguridad)", () => {
  let kv: KVNamespace;

  beforeEach(() => {
    kv = kvFalso();
  });

  it("deja bloquear mientras no se pase del tope", async () => {
    for (let i = 0; i < TOPE_BLOQUEOS_DIARIOS; i++) {
      await expect(permitirBloqueo(kv, "2026-08-23")).resolves.toBe(true);
    }
  });

  it("corta al pasarse: si alguien roba el token, no puede voltear toda la cartera", async () => {
    for (let i = 0; i < TOPE_BLOQUEOS_DIARIOS; i++) await permitirBloqueo(kv, "2026-08-23");

    await expect(permitirBloqueo(kv, "2026-08-23")).resolves.toBe(false);
  });

  it("el tope es por día: al día siguiente vuelve a cero", async () => {
    for (let i = 0; i < TOPE_BLOQUEOS_DIARIOS; i++) await permitirBloqueo(kv, "2026-08-23");

    await expect(permitirBloqueo(kv, "2026-08-24")).resolves.toBe(true);
  });
});

describe("esEstadoValido", () => {
  it("acepta los cuatro estados", () => {
    for (const e of ["ACTIVA", "RECORDATORIO", "ADVERTENCIA", "BLOQUEADA"]) {
      expect(esEstadoValido(e)).toBe(true);
    }
  });

  it("rechaza cualquier otra cosa", () => {
    for (const e of ["", "activa", "GRATIS", null, undefined, 42, {}]) {
      expect(esEstadoValido(e)).toBe(false);
    }
  });
});

describe("soloFecha", () => {
  it("devuelve el día en formato ISO corto", () => {
    expect(soloFecha(new Date("2026-08-23T22:30:00Z"))).toBe("2026-08-23");
  });
});
