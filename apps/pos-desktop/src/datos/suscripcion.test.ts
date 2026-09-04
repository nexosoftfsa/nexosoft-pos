import { describe, it, expect } from "vitest";
import { EstadoSuscripcion, Plan, type EstadoLicencia } from "@nexosoft/licencias";

import { parsearEstadoGuardado, SUSCRIPCION_ACTIVA, tonoDe } from "./suscripcion";

function guardado(estado: Partial<EstadoLicencia>): string {
  return JSON.stringify(estado);
}

describe("parsearEstadoGuardado", () => {
  it("sin nada guardado, deja operar", () => {
    expect(parsearEstadoGuardado(null)).toEqual(SUSCRIPCION_ACTIVA);
  });

  it("recuerda un bloqueo entre reinicios del POS", () => {
    const r = parsearEstadoGuardado(
      guardado({ estado: EstadoSuscripcion.Bloqueada, aviso: "Pagá la suscripción." }),
    );

    expect(r.puedeVender).toBe(false);
    expect(r.aviso).toBe("Pagá la suscripción.");
  });

  it("recuerda una advertencia sin impedir vender", () => {
    const r = parsearEstadoGuardado(guardado({ estado: EstadoSuscripcion.Advertencia }));
    expect(r.estado).toBe(EstadoSuscripcion.Advertencia);
    expect(r.puedeVender).toBe(true);
  });

  describe("ante la duda, deja vender", () => {
    it("con un texto que no es JSON", () => {
      expect(parsearEstadoGuardado("{roto").puedeVender).toBe(true);
    });

    it("con un estado que no existe", () => {
      expect(parsearEstadoGuardado(guardado({ estado: "REGALADO" as never })).puedeVender).toBe(
        true,
      );
    });

    it("con un JSON vacío", () => {
      expect(parsearEstadoGuardado("{}").puedeVender).toBe(true);
    });
  });

  describe("el plan sobrevive al reinicio y al corte (ADR-0067)", () => {
    it("recuerda el plan guardado, para gatear el menú sin servidor", () => {
      const r = parsearEstadoGuardado(
        guardado({ estado: EstadoSuscripcion.Activa, plan: Plan.Basica }),
      );
      expect(r.plan).toBe(Plan.Basica);
    });

    it("un plan corrupto cae en Premium, no en Básica", () => {
      const r = parsearEstadoGuardado(
        guardado({ estado: EstadoSuscripcion.Activa, plan: "REGALADO" as never }),
      );
      expect(r.plan).toBe(Plan.Premium);
    });

    it("un bloqueo no baja de plan: se deja de vender, nada más", () => {
      const r = parsearEstadoGuardado(
        guardado({ estado: EstadoSuscripcion.Bloqueada, plan: Plan.Plus }),
      );
      expect(r.puedeVender).toBe(false);
      expect(r.plan).toBe(Plan.Plus);
    });
  });

  it("no confía en el puedeVender guardado: lo deriva del estado", () => {
    // Si alguien edita el SQLite para desbloquearse, el estado sigue mandando.
    const manipulado = guardado({ estado: EstadoSuscripcion.Bloqueada, puedeVender: true });
    expect(parsearEstadoGuardado(manipulado).puedeVender).toBe(false);
  });
});

describe("tonoDe", () => {
  it("no muestra nada con la suscripción al día", () => {
    expect(tonoDe(SUSCRIPCION_ACTIVA)).toBeNull();
  });

  it("recordatorio es un aviso suave", () => {
    expect(
      tonoDe({ ...SUSCRIPCION_ACTIVA, estado: EstadoSuscripcion.Recordatorio, aviso: "x" }),
    ).toBe("info");
  });

  it("advertencia sube el tono", () => {
    expect(
      tonoDe({ ...SUSCRIPCION_ACTIVA, estado: EstadoSuscripcion.Advertencia, aviso: "x" }),
    ).toBe("advertencia");
  });

  it("bloqueo es bloqueo", () => {
    expect(
      tonoDe({
        ...SUSCRIPCION_ACTIVA,
        estado: EstadoSuscripcion.Bloqueada,
        puedeVender: false,
        aviso: "x",
      }),
    ).toBe("bloqueo");
  });
});
