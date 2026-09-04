import { describe, it, expect } from "vitest";
import {
  ORDEN_PLANES,
  PLAN_MINIMO,
  Plan,
  alcanzaPlan,
  esModuloId,
  esPlan,
  moduloDisponible,
  planDeLicencia,
  planQueLoHabilita,
  type ModuloId,
} from "./plan";

describe("planDeLicencia — lo que no se entiende es Premium (ADR-0067 §2)", () => {
  it("devuelve el plan cuando es uno de los tres", () => {
    expect(planDeLicencia("BASICA")).toBe(Plan.Basica);
    expect(planDeLicencia("PLUS")).toBe(Plan.Plus);
    expect(planDeLicencia("PREMIUM")).toBe(Plan.Premium);
  });

  it.each([undefined, null, "", "GRATIS", 3, {}])(
    "cae en Premium con %p, para no apagarle módulos a un cliente que los tiene pagos",
    (valor) => {
      expect(planDeLicencia(valor)).toBe(Plan.Premium);
    },
  );
});

describe("alcanzaPlan", () => {
  it("un plan se alcanza a sí mismo", () => {
    for (const plan of ORDEN_PLANES) expect(alcanzaPlan(plan, plan)).toBe(true);
  });

  it("los planes son acumulativos: el de arriba incluye lo de abajo", () => {
    expect(alcanzaPlan(Plan.Premium, Plan.Basica)).toBe(true);
    expect(alcanzaPlan(Plan.Premium, Plan.Plus)).toBe(true);
    expect(alcanzaPlan(Plan.Plus, Plan.Basica)).toBe(true);
  });

  it("no alcanza para arriba", () => {
    expect(alcanzaPlan(Plan.Basica, Plan.Plus)).toBe(false);
    expect(alcanzaPlan(Plan.Basica, Plan.Premium)).toBe(false);
    expect(alcanzaPlan(Plan.Plus, Plan.Premium)).toBe(false);
  });
});

describe("la tabla de planes (ADR-0067 §7)", () => {
  it("Básica vende, factura y controla stock", () => {
    for (const modulo of ["pos", "caja", "comprobantes", "catalogo", "stock"] as ModuloId[]) {
      expect(moduloDisponible(modulo, Plan.Basica)).toBe(true);
    }
  });

  it("Básica no llega a la gestión comercial", () => {
    for (const modulo of ["ctacte", "presupuestos", "remitos", "reportes"] as ModuloId[]) {
      expect(moduloDisponible(modulo, Plan.Basica)).toBe(false);
    }
  });

  it("Plus llega a la gestión pero no al asistente ni al acceso remoto", () => {
    expect(moduloDisponible("ctacte", Plan.Plus)).toBe(true);
    expect(moduloDisponible("reportes", Plan.Plus)).toBe(true);
    expect(moduloDisponible("ia", Plan.Plus)).toBe(false);
    expect(moduloDisponible("acceso-remoto", Plan.Plus)).toBe(false);
  });

  it("Premium tiene todo", () => {
    for (const modulo of Object.keys(PLAN_MINIMO) as ModuloId[]) {
      expect(moduloDisponible(modulo, Plan.Premium)).toBe(true);
    }
  });

  it("Configuración y Usuarios están en todos los planes: hacen falta para poder reactivar", () => {
    expect(moduloDisponible("config", Plan.Basica)).toBe(true);
    expect(moduloDisponible("usuarios", Plan.Basica)).toBe(true);
  });

  it("el candado dice qué plan hay que contratar", () => {
    expect(planQueLoHabilita("reportes")).toBe(Plan.Plus);
    expect(planQueLoHabilita("ia")).toBe(Plan.Premium);
  });
});

describe("esPlan / esModuloId", () => {
  it("reconocen lo válido y rechazan lo demás", () => {
    expect(esPlan("PLUS")).toBe(true);
    expect(esPlan("plus")).toBe(false);
    expect(esModuloId("reportes")).toBe(true);
    expect(esModuloId("inventado")).toBe(false);
    // No se puede colar por la cadena de prototipos.
    expect(esModuloId("toString")).toBe(false);
  });
});
