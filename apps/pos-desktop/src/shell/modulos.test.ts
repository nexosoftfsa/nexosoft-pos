import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { PLAN_MINIMO, Plan } from "@nexosoft/licencias";

import {
  buscarModulo,
  MODULOS,
  moduloEnPlan,
  moduloInicial,
  modulosVisibles,
  normalizarRol,
  planDelModulo,
} from "./modulos";

/**
 * El prompt del Asistente IA (cloud-api) enumera los módulos del POS a mano —
 * es lo único que el LLM "sabe" del sistema. Se había desactualizado y el
 * asistente le contestó al cliente que NexoSoft no tiene módulo de
 * Proveedores, que sí existe desde la Fase 12. Este test lee el prompt real y
 * falla si se agrega un módulo sin contárselo al asistente.
 */
describe("el prompt del Asistente IA conoce todos los módulos", () => {
  const rutaPrompt = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../cloud-api/src/asistente/prompt-sistema.ts",
  );

  it("menciona cada módulo por su título", () => {
    const prompt = readFileSync(rutaPrompt, "utf8");
    const faltantes = MODULOS.filter((m) => !prompt.includes(m.titulo)).map((m) => m.titulo);
    expect(faltantes, "módulos que el asistente no conoce (agregalos al prompt)").toEqual([]);
  });
});

describe("normalizarRol", () => {
  it("acepta los roles conocidos", () => {
    expect(normalizarRol("ADMIN")).toBe("ADMIN");
    expect(normalizarRol("SUPERVISOR")).toBe("SUPERVISOR");
    expect(normalizarRol("CAJERO")).toBe("CAJERO");
  });

  it("cae al menor privilegio (CAJERO) ante un rol desconocido o ausente", () => {
    expect(normalizarRol(undefined)).toBe("CAJERO");
    expect(normalizarRol("ROOT")).toBe("CAJERO");
    expect(normalizarRol("")).toBe("CAJERO");
  });
});

describe("modulosVisibles", () => {
  it("el ADMIN ve todos los módulos", () => {
    expect(modulosVisibles("ADMIN")).toHaveLength(MODULOS.length);
  });

  it("el SUPERVISOR ve todos los módulos salvo Usuarios (solo ADMIN)", () => {
    expect(modulosVisibles("SUPERVISOR")).toHaveLength(MODULOS.length - 1);
    expect(modulosVisibles("SUPERVISOR").map((m) => m.id)).not.toContain("usuarios");
  });

  it("solo el ADMIN ve Usuarios", () => {
    expect(modulosVisibles("ADMIN").map((m) => m.id)).toContain("usuarios");
    expect(modulosVisibles("SUPERVISOR").map((m) => m.id)).not.toContain("usuarios");
    expect(modulosVisibles("CAJERO").map((m) => m.id)).not.toContain("usuarios");
  });

  it("el CAJERO solo ve la operación (inicio, ventas, caja, comprobantes, presupuestos)", () => {
    const ids = modulosVisibles("CAJERO").map((m) => m.id);
    expect(ids).toEqual(["inicio", "pos", "caja", "comprobantes", "presupuestos", "remitos"]);
  });

  it("el CAJERO no ve gestión, reportes ni configuración", () => {
    const ids = modulosVisibles("CAJERO").map((m) => m.id);
    for (const oculto of ["catalogo", "stock", "ctacte", "etiquetas", "reportes", "ia", "config"]) {
      expect(ids).not.toContain(oculto);
    }
  });

  it("respeta el orden declarado en MODULOS", () => {
    const visibles = modulosVisibles("ADMIN").map((m) => m.id);
    expect(visibles).toEqual(MODULOS.map((m) => m.id));
  });
});

describe("moduloInicial", () => {
  it("arranca en Inicio para cualquier rol", () => {
    expect(moduloInicial("ADMIN")).toBe("inicio");
    expect(moduloInicial("CAJERO")).toBe("inicio");
    expect(moduloInicial(undefined)).toBe("inicio");
  });

  it("el módulo inicial lo ve el rol más bajo", () => {
    // Si Inicio dejara de ser visible para CAJERO, el POS abriría en una
    // pantalla vacía en vez de caer en el primer módulo permitido.
    expect(modulosVisibles("CAJERO").map((m) => m.id)).toContain(moduloInicial("CAJERO"));
  });
});

describe("buscarModulo", () => {
  it("encuentra un módulo existente", () => {
    expect(buscarModulo("config")?.externo).toBe(true);
  });

  it("devuelve undefined si no existe", () => {
    expect(buscarModulo("inexistente")).toBeUndefined();
  });
});

describe("planes en el menú (ADR-0067)", () => {
  const modulo = (id: string) => MODULOS.find((m) => m.id === id)!;

  it("todo módulo del menú tiene un plan asignado", () => {
    for (const m of MODULOS) {
      expect(PLAN_MINIMO[m.id], `el módulo "${m.id}" no está en la tabla de planes`).toBeDefined();
    }
  });

  it("el menú NO filtra por plan: los módulos bloqueados se siguen viendo", () => {
    // Decisión de ADR-0067 §4: esconderlos sería más prolijo y vendería menos.
    // El gateo se muestra con candado, no ocultando.
    const ids = modulosVisibles("ADMIN").map((m) => m.id);
    expect(ids).toContain("reportes");
    expect(ids).toContain("ia");
  });

  it("con Básica se puede entrar a vender, facturar y mover stock", () => {
    for (const id of ["pos", "caja", "comprobantes", "catalogo", "stock", "config"]) {
      expect(moduloEnPlan(modulo(id), Plan.Basica), id).toBe(true);
    }
  });

  it("con Básica quedan con candado la gestión y el asistente", () => {
    for (const id of ["ctacte", "presupuestos", "remitos", "reportes", "ia"]) {
      expect(moduloEnPlan(modulo(id), Plan.Basica), id).toBe(false);
    }
  });

  it("con Plus se abre la gestión pero el asistente sigue con candado", () => {
    expect(moduloEnPlan(modulo("reportes"), Plan.Plus)).toBe(true);
    expect(moduloEnPlan(modulo("ia"), Plan.Plus)).toBe(false);
  });

  it("con Premium no queda nada con candado", () => {
    for (const m of MODULOS) expect(moduloEnPlan(m, Plan.Premium), m.id).toBe(true);
  });

  it("el candado dice a qué plan hay que subir", () => {
    expect(planDelModulo(modulo("reportes"))).toBe(Plan.Plus);
    expect(planDelModulo(modulo("ia"))).toBe(Plan.Premium);
  });

  it("Configuración nunca se bloquea: hace falta para poder ampliar el plan", () => {
    expect(moduloEnPlan(modulo("config"), Plan.Basica)).toBe(true);
  });
});
