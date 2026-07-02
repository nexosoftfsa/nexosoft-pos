import { describe, expect, it } from "vitest";

import type { Cliente } from "../sync/cliente-ctacte";
import {
  aDatosCliente,
  etiquetaCondicion,
  FORM_CLIENTE_VACIO,
  formDesdeCliente,
  leerSaldo,
  validarCliente,
  type FormCliente,
} from "./ctacte-helpers";

const valido: FormCliente = {
  nombre: "Kiosco Ana",
  documento: "27-30111222-3",
  condicionIva: "MONOTRIBUTO",
  email: "ana@example.com",
  telefono: "3541-555100",
  direccion: "San Martín 145",
  limiteCredito: "50.000,50",
};

describe("validarCliente", () => {
  it("acepta un formulario válido", () => {
    expect(validarCliente(valido)).toEqual([]);
  });

  it("exige el nombre", () => {
    expect(validarCliente({ ...FORM_CLIENTE_VACIO })).toContain("El nombre es obligatorio.");
  });

  it("rechaza límite no numérico y email inválido", () => {
    const errores = validarCliente({ ...valido, limiteCredito: "abc", email: "no-es-mail" });
    expect(errores).toContain("El límite de crédito debe ser un número válido (0 o más).");
    expect(errores).toContain("El email no tiene un formato válido.");
  });

  it("permite límite vacío (sin límite)", () => {
    expect(validarCliente({ ...valido, limiteCredito: "" })).toEqual([]);
  });
});

describe("aDatosCliente", () => {
  it("normaliza el límite es-AR y manda '0' si está vacío", () => {
    expect(aDatosCliente({ ...valido, limiteCredito: "50.000,50" }).limiteCredito).toBe("50000.50");
    expect(aDatosCliente({ ...valido, limiteCredito: "" }).limiteCredito).toBe("0");
  });

  it("omite los campos opcionales vacíos", () => {
    const datos = aDatosCliente({ ...FORM_CLIENTE_VACIO, nombre: "X" });
    expect(datos.documento).toBeUndefined();
    expect(datos.email).toBeUndefined();
    expect(datos.nombre).toBe("X");
  });
});

describe("formDesdeCliente", () => {
  it("vuelca un cliente al formulario (límite 0 => vacío)", () => {
    const c: Cliente = {
      id: "c1",
      nombre: "José",
      documento: null,
      condicionIva: "CONSUMIDOR_FINAL",
      email: null,
      telefono: null,
      direccion: null,
      limiteCredito: "0.00",
      activo: true,
    };
    expect(formDesdeCliente(c).limiteCredito).toBe("");
    expect(formDesdeCliente(c).documento).toBe("");
  });
});

describe("leerSaldo", () => {
  it("interpreta debe / al día / a favor", () => {
    expect(leerSaldo("7000.00").estado).toBe("debe");
    expect(leerSaldo("0.00").estado).toBe("aldia");
    expect(leerSaldo("-500.00").estado).toBe("afavor");
  });
});

describe("etiquetaCondicion", () => {
  it("traduce la condición de IVA", () => {
    expect(etiquetaCondicion("RESPONSABLE_INSCRIPTO")).toBe("Responsable Inscripto");
  });
});
