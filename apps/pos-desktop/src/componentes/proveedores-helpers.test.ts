import { describe, expect, it } from "vitest";

import type { Proveedor } from "../sync/cliente-proveedores";
import {
  aDatosProveedor,
  filtrarProveedores,
  FORM_PROVEEDOR_VACIO,
  formDesdeProveedor,
  validarProveedor,
  type FormProveedor,
} from "./proveedores-helpers";

const valido: FormProveedor = {
  nombre: "Distribuidora Sur",
  cuit: "30-71234567-8",
  contacto: "Marcelo Díaz",
  email: "ventas@distribuidorasur.com.ar",
  telefono: "3541-555200",
  direccion: "Ruta 5 km 12",
};

describe("validarProveedor", () => {
  it("acepta un formulario válido", () => {
    expect(validarProveedor(valido)).toEqual([]);
  });

  it("exige el nombre", () => {
    expect(validarProveedor({ ...FORM_PROVEEDOR_VACIO })).toContain("El nombre es obligatorio.");
  });

  it("rechaza un email inválido", () => {
    expect(validarProveedor({ ...valido, email: "no-es-mail" })).toContain(
      "El email no tiene un formato válido.",
    );
  });

  it("permite email vacío", () => {
    expect(validarProveedor({ ...valido, email: "" })).toEqual([]);
  });
});

describe("aDatosProveedor", () => {
  it("recorta espacios y omite los campos opcionales vacíos", () => {
    const datos = aDatosProveedor({ ...FORM_PROVEEDOR_VACIO, nombre: "  X  " });
    expect(datos.nombre).toBe("X");
    expect(datos.cuit).toBeUndefined();
    expect(datos.email).toBeUndefined();
  });

  it("incluye los campos opcionales presentes", () => {
    expect(aDatosProveedor(valido)).toEqual(valido);
  });
});

describe("formDesdeProveedor", () => {
  it("vuelca un proveedor al formulario (null => vacío)", () => {
    const p: Proveedor = {
      id: "p1",
      nombre: "Lácteos del Valle",
      cuit: null,
      contacto: null,
      email: null,
      telefono: null,
      direccion: null,
      activo: true,
    };
    expect(formDesdeProveedor(p)).toEqual({
      nombre: "Lácteos del Valle",
      cuit: "",
      contacto: "",
      email: "",
      telefono: "",
      direccion: "",
    });
  });
});

describe("filtrarProveedores", () => {
  const proveedores: Proveedor[] = [
    { id: "p1", nombre: "Distribuidora Sur", cuit: "30-1", contacto: "Marcelo", email: null, telefono: null, direccion: null, activo: true },
    { id: "p2", nombre: "Lácteos del Valle", cuit: "30-2", contacto: null, email: null, telefono: null, direccion: null, activo: true },
  ];

  it("sin búsqueda devuelve todo", () => {
    expect(filtrarProveedores(proveedores, "")).toHaveLength(2);
  });

  it("filtra por nombre, CUIT o contacto", () => {
    expect(filtrarProveedores(proveedores, "lácteos")).toEqual([proveedores[1]]);
    expect(filtrarProveedores(proveedores, "30-1")).toEqual([proveedores[0]]);
    expect(filtrarProveedores(proveedores, "marcelo")).toEqual([proveedores[0]]);
  });

  it("un proveedor sin contacto no rompe el filtro", () => {
    expect(filtrarProveedores(proveedores, "valle")).toHaveLength(1);
  });
});
