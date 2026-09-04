import { describe, it, expect, beforeEach } from "vitest";
import {
  DIAS_RECORDATORIO,
  esEstadoValido,
  esPlanValido,
  esPrecioValido,
  estadoEfectivo,
  estadoSegunFecha,
  licenciaDe,
  normalizar,
  permitirBloqueo,
  proximoVencimiento,
  registrarPago,
  soloFecha,
  sumarUnMes,
  TOPE_BLOQUEOS_DIARIOS,
  type Cliente,
} from "./clientes";

const CLIENTE: Cliente = {
  comercioId: "lagus",
  nombre: "Lagus Minimarket",
  estadoManual: null,
  plan: "PLUS",
  vencePagoEl: "2026-09-10",
  precioMensual: null,
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

  it("arma la licencia con el estado y el plan del cliente", () => {
    const lic = licenciaDe(CLIENTE, ahora);
    expect(lic.comercioId).toBe("lagus");
    expect(lic.estado).toBe("ACTIVA");
    expect(lic.plan).toBe("PLUS");
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

  it("emite el estado que corresponde por fecha, no uno guardado que quedó viejo", () => {
    // El pago venció hace días y nadie tocó el panel.
    const lic = licenciaDe({ ...CLIENTE, vencePagoEl: "2026-08-10" }, ahora);
    expect(lic.estado).toBe("ADVERTENCIA");
  });
});

describe("estadoSegunFecha — el sistema avisa solo (ADR-0056 §4)", () => {
  const hoy = "2026-09-01";

  it("al día, todavía lejos del pago: no dice nada", () => {
    expect(estadoSegunFecha("2026-10-01", hoy)).toBe("ACTIVA");
  });

  it("dentro de los días previos: recordatorio", () => {
    expect(estadoSegunFecha("2026-09-05", hoy)).toBe("RECORDATORIO");
  });

  it("justo en el límite del recordatorio, ya avisa", () => {
    const limite = "2026-09-08"; // hoy + DIAS_RECORDATORIO
    expect(DIAS_RECORDATORIO).toBe(7);
    expect(estadoSegunFecha(limite, hoy)).toBe("RECORDATORIO");
  });

  it("el mismo día del vencimiento todavía es recordatorio, no advertencia", () => {
    expect(estadoSegunFecha(hoy, hoy)).toBe("RECORDATORIO");
  });

  it("vencido: advertencia", () => {
    expect(estadoSegunFecha("2026-08-25", hoy)).toBe("ADVERTENCIA");
  });

  it("NUNCA bloquea solo, por más atrasado que esté", () => {
    expect(estadoSegunFecha("2020-01-01", hoy)).toBe("ADVERTENCIA");
  });

  it("con una fecha ilegible no inventa nada: deja al comercio tranquilo", () => {
    expect(estadoSegunFecha("", hoy)).toBe("ACTIVA");
    expect(estadoSegunFecha("cuando pueda", hoy)).toBe("ACTIVA");
  });
});

describe("estadoEfectivo — lo fijado a mano gana", () => {
  it("sin nada fijado, manda el calendario", () => {
    expect(estadoEfectivo({ ...CLIENTE, vencePagoEl: "2026-08-01" }, "2026-09-01")).toBe(
      "ADVERTENCIA",
    );
  });

  it("con un estado fijado, manda ese aunque la fecha diga otra cosa", () => {
    const bloqueado = { ...CLIENTE, estadoManual: "BLOQUEADA" as const };
    expect(estadoEfectivo(bloqueado, "2026-09-01")).toBe("BLOQUEADA");
  });

  it("se puede dejar en ACTIVA a mano un comercio con el pago vencido", () => {
    // El caso real: "ya me paga el lunes, dejalo andando".
    const perdonado = { ...CLIENTE, vencePagoEl: "2026-08-01", estadoManual: "ACTIVA" as const };
    expect(estadoEfectivo(perdonado, "2026-09-01")).toBe("ACTIVA");
  });
});

describe("registrarPago", () => {
  it("corre el vencimiento un mes conservando el día acordado", () => {
    const r = registrarPago({ ...CLIENTE, vencePagoEl: "2026-09-10" }, "2026-09-08");
    expect(r.vencePagoEl).toBe("2026-10-10");
  });

  it("desbloquea: pagar levanta cualquier estado fijado a mano", () => {
    const r = registrarPago({ ...CLIENTE, estadoManual: "BLOQUEADA" }, "2026-09-08");
    expect(r.estadoManual).toBeNull();
    expect(estadoEfectivo(r, "2026-09-08")).not.toBe("BLOQUEADA");
  });

  it("un pago con mucho atraso no deja la próxima fecha en el pasado", () => {
    // Ocho meses atrasado: avanza de a meses hasta pasar hoy, conservando el
    // día 10 acordado. No perdona los meses, pero tampoco deja un vencimiento
    // viejo que dispararía la advertencia al instante siguiente.
    const r = registrarPago({ ...CLIENTE, vencePagoEl: "2026-01-10" }, "2026-09-08");
    expect(r.vencePagoEl).toBe("2026-09-10");
    expect(r.vencePagoEl > "2026-09-08").toBe(true);
  });
});

describe("sumarUnMes", () => {
  it("suma un mes normal", () => {
    expect(sumarUnMes("2026-09-10")).toBe("2026-10-10");
  });

  it("cruza el año", () => {
    expect(sumarUnMes("2026-12-31")).toBe("2027-01-31");
  });

  it("recorta el día cuando el mes destino es más corto", () => {
    expect(sumarUnMes("2026-01-31")).toBe("2026-02-28");
    expect(sumarUnMes("2026-03-31")).toBe("2026-04-30");
  });

  it("contempla el año bisiesto", () => {
    expect(sumarUnMes("2028-01-31")).toBe("2028-02-29");
  });
});

describe("proximoVencimiento", () => {
  it("con una fecha ilegible, cae en un mes desde hoy en vez de colgarse", () => {
    expect(proximoVencimiento("nunca", "2026-09-08")).toBe("2026-10-08");
  });
});

describe("normalizar — los comercios que ya estaban (ADR-0067 §2)", () => {
  it("un registro viejo sin plan queda en PREMIUM, no en BASICA", () => {
    const viejo = normalizar({ comercioId: "socio", nombre: "PC del socio", estado: "ACTIVA" });
    expect(viejo.plan).toBe("PREMIUM");
  });

  it("el estado que se fijaba a mano sigue fijado: nadie cambia de comportamiento por la migración", () => {
    const viejo = normalizar({ comercioId: "socio", nombre: "PC del socio", estado: "BLOQUEADA" });
    expect(viejo.estadoManual).toBe("BLOQUEADA");
    expect(estadoEfectivo(viejo, "2026-09-01")).toBe("BLOQUEADA");
  });

  it("un registro nuevo en automático se queda en automático", () => {
    const nuevo = normalizar({ comercioId: "lagus", plan: "PLUS", estadoManual: null });
    expect(nuevo.estadoManual).toBeNull();
    expect(nuevo.plan).toBe("PLUS");
  });

  it("descarta un precio con forma inválida en vez de propagarlo", () => {
    const c = normalizar({ comercioId: "x", precioMensual: { moneda: "dólares", importe: 50 } });
    expect(c.precioMensual).toBeNull();
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

describe("validaciones", () => {
  it("esEstadoValido acepta los cuatro estados y nada más", () => {
    for (const e of ["ACTIVA", "RECORDATORIO", "ADVERTENCIA", "BLOQUEADA"]) {
      expect(esEstadoValido(e)).toBe(true);
    }
    for (const e of ["", "activa", "GRATIS", null, undefined, 42, {}]) {
      expect(esEstadoValido(e)).toBe(false);
    }
  });

  it("esPlanValido acepta los tres planes y nada más", () => {
    for (const p of ["BASICA", "PLUS", "PREMIUM"]) expect(esPlanValido(p)).toBe(true);
    for (const p of ["", "basica", "GRATIS", null, 3]) expect(esPlanValido(p)).toBe(false);
  });

  it("esPrecioValido exige moneda ISO e importe decimal en texto, nunca float", () => {
    expect(esPrecioValido({ moneda: "USD", importe: "50" })).toBe(true);
    expect(esPrecioValido({ moneda: "ARS", importe: "85000.50" })).toBe(true);
    // Un `number` acá es justamente lo que no queremos (CLAUDE.md §3).
    expect(esPrecioValido({ moneda: "USD", importe: 50 })).toBe(false);
    expect(esPrecioValido({ moneda: "usd", importe: "50" })).toBe(false);
    expect(esPrecioValido({ moneda: "USD", importe: "50.005" })).toBe(false);
    expect(esPrecioValido({ moneda: "USD", importe: "-50" })).toBe(false);
    expect(esPrecioValido(null)).toBe(false);
  });
});

describe("soloFecha", () => {
  it("devuelve el día en formato ISO corto", () => {
    expect(soloFecha(new Date("2026-08-23T22:30:00Z"))).toBe("2026-08-23");
  });
});
