import { describe, expect, it } from "vitest";

import {
  buscarModulo,
  MODULOS,
  moduloInicial,
  modulosVisibles,
  normalizarRol,
} from "./modulos";

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

  it("el SUPERVISOR ve todos los módulos", () => {
    expect(modulosVisibles("SUPERVISOR")).toHaveLength(MODULOS.length);
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
  it("arranca en Punto de Venta para cualquier rol", () => {
    expect(moduloInicial("ADMIN")).toBe("pos");
    expect(moduloInicial("CAJERO")).toBe("pos");
    expect(moduloInicial(undefined)).toBe("pos");
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
