import { describe, expect, it } from "vitest";

import type { Tarjeta } from "../sync/cliente-medios-pago";
import {
  aDatosTarjeta,
  filtrarTarjetas,
  FORM_TARJETA_VACIO,
  formDesdeTarjeta,
  validarTarjeta,
  type FormTarjeta,
} from "./medios-pago-helpers";

const valido: FormTarjeta = {
  banco: "Banco Galicia",
  tipo: "CREDITO",
  marca: "Visa",
  tasas: [
    { cuotas: "1", porcentaje: "0" },
    { cuotas: "6", porcentaje: "18,5" },
  ],
};

describe("validarTarjeta", () => {
  it("acepta un formulario válido", () => {
    expect(validarTarjeta(valido)).toEqual([]);
  });

  it("exige el banco", () => {
    expect(validarTarjeta({ ...FORM_TARJETA_VACIO, banco: "" })).toContain("El banco es obligatorio.");
  });

  it("rechaza cuotas no numéricas o menores a 1", () => {
    const errores = validarTarjeta({ ...valido, tasas: [{ cuotas: "0", porcentaje: "10" }] });
    expect(errores.some((e) => e.includes("no es una cantidad de cuotas válida"))).toBe(true);
  });

  it("rechaza cuotas duplicadas", () => {
    const errores = validarTarjeta({
      ...valido,
      tasas: [
        { cuotas: "3", porcentaje: "10" },
        { cuotas: "3", porcentaje: "12" },
      ],
    });
    expect(errores.some((e) => e.includes("dos tasas para 3 cuota"))).toBe(true);
  });

  it("rechaza un porcentaje inválido", () => {
    const errores = validarTarjeta({ ...valido, tasas: [{ cuotas: "3", porcentaje: "abc" }] });
    expect(errores.some((e) => e.includes("debe ser un número válido"))).toBe(true);
  });
});

describe("aDatosTarjeta", () => {
  it("normaliza cuotas y porcentaje (es-AR) a números", () => {
    const datos = aDatosTarjeta(valido);
    expect(datos.tasas).toEqual([
      { cantidadCuotas: 1, recargoPorcentaje: 0 },
      { cantidadCuotas: 6, recargoPorcentaje: 18.5 },
    ]);
  });

  it("omite marca si está vacía", () => {
    expect(aDatosTarjeta({ ...valido, marca: "" }).marca).toBeUndefined();
  });
});

describe("formDesdeTarjeta", () => {
  it("vuelca una tarjeta al formulario (marca null => vacío)", () => {
    const t: Tarjeta = {
      id: "t1",
      banco: "Banco Santander",
      tipo: "DEBITO",
      marca: null,
      activo: true,
      tasas: [{ cantidadCuotas: 1, recargoPorcentaje: 0 }],
    };
    const f = formDesdeTarjeta(t);
    expect(f.marca).toBe("");
    expect(f.tasas).toEqual([{ cuotas: "1", porcentaje: "0" }]);
  });

  it("sin tasas, arranca con una fila vacía", () => {
    const t: Tarjeta = {
      id: "t2",
      banco: "Banco X",
      tipo: "CREDITO",
      marca: null,
      activo: true,
      tasas: [],
    };
    expect(formDesdeTarjeta(t).tasas).toHaveLength(1);
  });
});

describe("filtrarTarjetas", () => {
  const tarjetas: Tarjeta[] = [
    { id: "t1", banco: "Banco Galicia", tipo: "CREDITO", marca: "Visa", activo: true, tasas: [] },
    { id: "t2", banco: "Banco Santander", tipo: "DEBITO", marca: null, activo: true, tasas: [] },
  ];

  it("sin búsqueda devuelve todo", () => {
    expect(filtrarTarjetas(tarjetas, "")).toHaveLength(2);
  });

  it("filtra por banco o marca", () => {
    expect(filtrarTarjetas(tarjetas, "santander")).toEqual([tarjetas[1]]);
    expect(filtrarTarjetas(tarjetas, "visa")).toEqual([tarjetas[0]]);
  });
});
