import { describe, expect, it } from "vitest";

import type { ProductoAdmin } from "../sync/cliente-catalogo-admin";
import {
  aDatosProducto,
  etiquetaIva,
  FORM_VACIO,
  formDesdeProducto,
  margenUtilidad,
  validarProducto,
  type FormProducto,
} from "./catalogo-form";

const valido: FormProducto = {
  codigo: "7790009",
  nombre: "Fideos 500 g",
  descripcion: "Tirabuzón",
  precioVenta: "1.200,50",
  precioCosto: "800",
  tipoIva: "IVA_21",
  categoriaId: "cat-almacen",
};

describe("validarProducto", () => {
  it("acepta un formulario completo (con coma decimal)", () => {
    expect(validarProducto({ ...valido, precioVenta: "1200.50" })).toEqual([]);
  });

  it("exige código y descripción", () => {
    const errores = validarProducto({ ...FORM_VACIO });
    expect(errores).toContain("El código es obligatorio.");
    expect(errores).toContain("La descripción es obligatoria.");
  });

  it("rechaza precios no numéricos", () => {
    const errores = validarProducto({ ...valido, precioVenta: "abc", precioCosto: "-5" });
    expect(errores).toContain("El precio de venta debe ser un número válido.");
    expect(errores).toContain("El costo debe ser un número válido.");
  });
});

describe("aDatosProducto", () => {
  it("normaliza la coma decimal a punto y recorta espacios", () => {
    const datos = aDatosProducto({ ...valido, codigo: "  7790009 " });
    expect(datos.codigo).toBe("7790009");
    expect(datos.precioVenta).toBe("1200.50");
    expect(datos.precioCosto).toBe("800");
    expect(datos.categoriaId).toBe("cat-almacen");
  });

  it("manda categoriaId null cuando no se eligió categoría", () => {
    expect(aDatosProducto({ ...valido, categoriaId: "" }).categoriaId).toBeNull();
  });

  it("omite la descripción si quedó vacía", () => {
    expect(aDatosProducto({ ...valido, descripcion: "  " }).descripcion).toBeUndefined();
  });
});

describe("formDesdeProducto", () => {
  it("vuelca un producto existente al formulario", () => {
    const p: ProductoAdmin = {
      id: "x",
      codigo: "001",
      nombre: "Café",
      descripcion: null,
      precioVenta: "4300.00",
      precioCosto: "2800",
      tipoIva: "IVA_10_5",
      activo: true,
      categoria: { id: "cat-almacen", nombre: "Almacén" },
    };
    expect(formDesdeProducto(p)).toEqual({
      codigo: "001",
      nombre: "Café",
      descripcion: "",
      precioVenta: "4300.00",
      precioCosto: "2800",
      tipoIva: "IVA_10_5",
      categoriaId: "cat-almacen",
    });
  });
});

describe("margenUtilidad", () => {
  it("calcula el margen sobre el costo", () => {
    expect(margenUtilidad("1500", "1000")).toBeCloseTo(50);
  });

  it("devuelve null si el costo es cero o inválido", () => {
    expect(margenUtilidad("1500", "0")).toBeNull();
    expect(margenUtilidad("1500", "abc")).toBeNull();
  });
});

describe("etiquetaIva", () => {
  it("traduce el tipo de IVA a una etiqueta legible", () => {
    expect(etiquetaIva("IVA_10_5")).toBe("10,5%");
    expect(etiquetaIva("EXENTO")).toBe("Exento");
  });
});
