import { describe, expect, it } from "vitest";

import {
  admiteCuotas,
  admiteRecargo,
  motivosDeTasasInvalidas,
  motivoTasaInvalida,
  recargoQueCorresponde,
  TipoTarjeta,
} from "./recargo-de-tarjeta.js";

/**
 * La Ley 27.253 obliga a aceptar tarjeta de débito "sin aplicar recargo
 * alguno". Hasta el 17/9/2026 el sistema dejaba configurar un recargo en una
 * tarjeta de débito igual que en una de crédito, y lo cobraba.
 */
describe("recargo de tarjeta", () => {
  it("el crédito admite recargo y cuotas", () => {
    expect(admiteRecargo(TipoTarjeta.Credito)).toBe(true);
    expect(admiteCuotas(TipoTarjeta.Credito)).toBe(true);
  });

  it("el débito no admite ni recargo ni cuotas", () => {
    expect(admiteRecargo(TipoTarjeta.Debito)).toBe(false);
    expect(admiteCuotas(TipoTarjeta.Debito)).toBe(false);
  });

  describe("recargoQueCorresponde", () => {
    it("en crédito deja pasar el recargo configurado", () => {
      expect(recargoQueCorresponde(TipoTarjeta.Credito, 10)).toBe(10);
    });

    /**
     * La red de abajo, y la que más importa. Un comercio que ya tenía una
     * tarjeta de débito con recargo la sigue teniendo en su base: si sólo se
     * validara el alta, el POS le seguiría cobrando de más al cliente hasta
     * que alguien entrara a editarla.
     */
    it("en débito lo ignora, aunque la configuración guardada lo traiga", () => {
      expect(recargoQueCorresponde(TipoTarjeta.Debito, 10)).toBe(0);
    });

    it("un recargo negativo no baja el precio: se toma como cero", () => {
      expect(recargoQueCorresponde(TipoTarjeta.Credito, -5)).toBe(0);
    });
  });

  describe("motivoTasaInvalida", () => {
    it("una tasa de crédito cualquiera es válida", () => {
      expect(
        motivoTasaInvalida(TipoTarjeta.Credito, { cantidadCuotas: 6, recargoPorcentaje: 18 }),
      ).toBeNull();
    });

    it("débito en 1 cuota y sin recargo es lo único válido", () => {
      expect(
        motivoTasaInvalida(TipoTarjeta.Debito, { cantidadCuotas: 1, recargoPorcentaje: 0 }),
      ).toBeNull();
    });

    it("débito con recargo dice la ley, no sólo que no se puede", () => {
      const motivo = motivoTasaInvalida(TipoTarjeta.Debito, {
        cantidadCuotas: 1,
        recargoPorcentaje: 5,
      });
      expect(motivo).toContain("27.253");
      expect(motivo).toContain("sin recargo");
    });

    it("débito en cuotas no existe: el pago es único", () => {
      expect(
        motivoTasaInvalida(TipoTarjeta.Debito, { cantidadCuotas: 6, recargoPorcentaje: 0 }),
      ).toContain("no tiene cuotas");
    });
  });

  describe("motivosDeTasasInvalidas", () => {
    it("no repite el mismo motivo por cada tasa", () => {
      const motivos = motivosDeTasasInvalidas(TipoTarjeta.Debito, [
        { cantidadCuotas: 1, recargoPorcentaje: 3 },
        { cantidadCuotas: 1, recargoPorcentaje: 7 },
      ]);
      expect(motivos).toHaveLength(1);
    });

    it("una tarjeta de crédito no devuelve ninguno", () => {
      expect(
        motivosDeTasasInvalidas(TipoTarjeta.Credito, [
          { cantidadCuotas: 1, recargoPorcentaje: 0 },
          { cantidadCuotas: 12, recargoPorcentaje: 35 },
        ]),
      ).toEqual([]);
    });
  });
});
