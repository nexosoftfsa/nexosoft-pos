import { describe, expect, it } from "vitest";

import { ALICUOTAS_IVA } from "../fiscal/alicuota-iva.js";
import { Money } from "../dinero/money.js";
import { crearArticulo, desactivarArticulo } from "./articulo.js";
import { UnidadDeMedida } from "./unidad-de-medida.js";

const base = {
  codigoInterno: "A-001",
  descripcion: "Gaseosa 500ml",
  unidadDeMedida: UnidadDeMedida.Unidad,
  costoNeto: Money.desde("100.00"),
  alicuotaIva: ALICUOTAS_IVA.VEINTIUNO,
};

describe("crearArticulo", () => {
  it("crea un artículo activo con id generado", () => {
    const a = crearArticulo(base);
    expect(a.id).toBeTruthy();
    expect(a.activo).toBe(true);
    expect(a.descripcion).toBe("Gaseosa 500ml");
  });

  it("respeta el id provisto", () => {
    const a = crearArticulo({ ...base, id: "fijo-123" });
    expect(a.id).toBe("fijo-123");
  });

  it("recorta espacios de código y descripción", () => {
    const a = crearArticulo({ ...base, codigoInterno: "  A-9  ", descripcion: "  Pan  " });
    expect(a.codigoInterno).toBe("A-9");
    expect(a.descripcion).toBe("Pan");
  });

  it("incluye código de barras solo si viene no vacío", () => {
    expect(crearArticulo({ ...base, codigoBarras: "779000123" }).codigoBarras).toBe("779000123");
    expect(crearArticulo({ ...base, codigoBarras: "  " }).codigoBarras).toBeUndefined();
  });

  it("rechaza código vacío", () => {
    expect(() => crearArticulo({ ...base, codigoInterno: "   " })).toThrow(/código/i);
  });

  it("rechaza descripción vacía", () => {
    expect(() => crearArticulo({ ...base, descripcion: "" })).toThrow(/descripción/i);
  });

  it("rechaza costo negativo", () => {
    expect(() => crearArticulo({ ...base, costoNeto: Money.desde("-1") })).toThrow(/costo/i);
  });
});

describe("desactivarArticulo", () => {
  it("marca el artículo como inactivo sin mutar el original", () => {
    const a = crearArticulo(base);
    const baja = desactivarArticulo(a);
    expect(baja.activo).toBe(false);
    expect(a.activo).toBe(true);
  });
});
