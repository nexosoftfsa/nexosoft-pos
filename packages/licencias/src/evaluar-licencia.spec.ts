import { describe, it, expect } from "vitest";
import { evaluarLicencia } from "./evaluar-licencia";
import { EstadoSuscripcion, type Licencia } from "./licencia";
import { Plan } from "./plan";

const AHORA = new Date("2026-08-23T12:00:00Z");

function licencia(parcial: Partial<Licencia> = {}): Licencia {
  return {
    comercioId: "lagus",
    estado: EstadoSuscripcion.Activa,
    vencePagoEl: "2026-09-10",
    validaHasta: "2026-08-30T00:00:00Z",
    emitidaEn: "2026-08-23T00:00:00Z",
    ...parcial,
  };
}

describe("evaluarLicencia", () => {
  describe("al día", () => {
    it("no dice nada y deja vender", () => {
      expect(evaluarLicencia(licencia({ plan: Plan.Plus }), AHORA)).toEqual({
        estado: EstadoSuscripcion.Activa,
        plan: Plan.Plus,
        puedeVender: true,
        aviso: null,
        sinValidar: false,
      });
    });
  });

  describe("los tres escalones", () => {
    it("recordatorio: avisa la fecha de pago y deja vender", () => {
      const r = evaluarLicencia(licencia({ estado: EstadoSuscripcion.Recordatorio }), AHORA);
      expect(r.puedeVender).toBe(true);
      expect(r.aviso).toContain("10/09/2026");
    });

    it("advertencia: avisa que se va a bloquear, pero todavía deja vender", () => {
      const r = evaluarLicencia(licencia({ estado: EstadoSuscripcion.Advertencia }), AHORA);
      expect(r.puedeVender).toBe(true);
      expect(r.aviso).toContain("bloquear");
    });

    it("bloqueada: no deja vender", () => {
      const r = evaluarLicencia(licencia({ estado: EstadoSuscripcion.Bloqueada }), AHORA);
      expect(r.puedeVender).toBe(false);
      expect(r.aviso).toContain("NexoSoft");
    });
  });

  describe("un corte de internet nunca bloquea (ADR-0056 §3)", () => {
    it("token vencido: queda en advertencia, NO en bloqueo", () => {
      const vieja = licencia({ validaHasta: "2026-08-20T00:00:00Z" });

      const r = evaluarLicencia(vieja, AHORA);

      expect(r.estado).toBe(EstadoSuscripcion.Advertencia);
      expect(r.puedeVender).toBe(true);
      expect(r.sinValidar).toBe(true);
      expect(r.aviso).toContain("20/08/2026");
    });

    it("un recordatorio con token vencido tampoco escala a bloqueo", () => {
      const r = evaluarLicencia(
        licencia({ estado: EstadoSuscripcion.Recordatorio, validaHasta: "2026-08-01T00:00:00Z" }),
        AHORA,
      );
      expect(r.puedeVender).toBe(true);
    });

    it("sin ninguna licencia todavía (instalación nueva sin internet), deja operar", () => {
      const r = evaluarLicencia(null, AHORA);
      expect(r.puedeVender).toBe(true);
      expect(r.estado).toBe(EstadoSuscripcion.Activa);
      expect(r.sinValidar).toBe(true);
    });
  });

  describe("el bloqueo firmado sí manda, aunque el token esté vencido", () => {
    it("sigue bloqueado y lo marca como no validado", () => {
      const r = evaluarLicencia(
        licencia({ estado: EstadoSuscripcion.Bloqueada, validaHasta: "2026-08-01T00:00:00Z" }),
        AHORA,
      );
      expect(r.puedeVender).toBe(false);
      expect(r.sinValidar).toBe(true);
    });
  });

  describe("mensaje del panel", () => {
    it("si el panel mandó un texto, se muestra ese y no el genérico", () => {
      const r = evaluarLicencia(
        licencia({
          estado: EstadoSuscripcion.Advertencia,
          mensaje: "Hablá con Rodrigo al 3704-...",
        }),
        AHORA,
      );
      expect(r.aviso).toBe("Hablá con Rodrigo al 3704-...");
    });
  });

  describe("el plan (ADR-0067 §2)", () => {
    it("lo pasa tal cual cuando la licencia lo trae", () => {
      expect(evaluarLicencia(licencia({ plan: Plan.Basica }), AHORA).plan).toBe(Plan.Basica);
    });

    it("una licencia vieja, sin plan, queda en Premium y no pierde módulos", () => {
      expect(evaluarLicencia(licencia(), AHORA).plan).toBe(Plan.Premium);
    });

    it("sin ninguna licencia todavía, también es Premium", () => {
      expect(evaluarLicencia(null, AHORA).plan).toBe(Plan.Premium);
    });

    it("el plan sobrevive al bloqueo: se deja de vender, no se baja de plan", () => {
      const r = evaluarLicencia(
        licencia({ estado: EstadoSuscripcion.Bloqueada, plan: Plan.Plus }),
        AHORA,
      );
      expect(r.puedeVender).toBe(false);
      expect(r.plan).toBe(Plan.Plus);
    });

    it("con el token vencido conserva el plan que tenía", () => {
      const r = evaluarLicencia(
        licencia({ plan: Plan.Plus, validaHasta: "2026-08-01T00:00:00Z" }),
        AHORA,
      );
      expect(r.sinValidar).toBe(true);
      expect(r.plan).toBe(Plan.Plus);
    });
  });

  describe("fechas", () => {
    it("las muestra en formato argentino, sin depender de la zona horaria", () => {
      const r = evaluarLicencia(
        licencia({ estado: EstadoSuscripcion.Recordatorio, vencePagoEl: "2026-01-05" }),
        AHORA,
      );
      expect(r.aviso).toContain("05/01/2026");
    });

    it("justo en el límite del vencimiento del token, todavía vale", () => {
      const justo = licencia({ validaHasta: AHORA.toISOString() });
      expect(evaluarLicencia(justo, AHORA).sinValidar).toBe(false);
    });
  });
});
