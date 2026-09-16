import { describe, expect, it } from "vitest";

import { ALICUOTAS_IVA, ModoPrecio } from "@nexosoft/domain";

import { mapearAlicuota, mapearProducto, type ProductoRemoto } from "./mapeo-catalogo";

describe("mapearAlicuota", () => {
  it("traduce cada tipo del cloud-api a su alícuota de dominio", () => {
    expect(mapearAlicuota("IVA_10_5")?.porcentaje).toBe(10.5);
    expect(mapearAlicuota("IVA_21")?.porcentaje).toBe(21);
    expect(mapearAlicuota("IVA_27")?.porcentaje).toBe(27);
  });

  /**
   * Hasta el 16/9/2026 EXENTO se mapeaba a la alícuota del 0%, y no son lo
   * mismo: el 0% lleva renglón ante ARCA con Id 3 y el exento va a `ImpOpEx`
   * sin renglón. El servidor siempre lo mandó bien, pero el TICKET imprimía una
   * línea "IVA 0%" que el comprobante fiscal no tenía.
   */
  it("EXENTO es null, que NO es la alícuota del 0%", () => {
    expect(mapearAlicuota("EXENTO")).toBeNull();
    expect(mapearAlicuota("EXENTO")).not.toEqual(ALICUOTAS_IVA.CERO);
  });

  it("un tipo desconocido cae al 21%, no a exento", () => {
    // Un producto mal configurado tiene que pagar IVA, no quedar exento: lo
    // contrario sería una diferencia a favor del comercio ante ARCA.
    expect(mapearAlicuota("IVA_99" as never)?.porcentaje).toBe(21);
  });
});

describe("mapearProducto", () => {
  const remoto: ProductoRemoto = {
    id: "ckp1",
    codigo: "7791234",
    nombre: "Coca Cola 2,25 L",
    descripcion: null,
    precioVenta: "2500.00",
    precioCosto: "1500.00",
    tipoIva: "IVA_21",
    activo: true,
  };

  it("arma el artículo con código interno y de barras desde `codigo`", () => {
    const { articulo } = mapearProducto(remoto);
    expect(articulo.id).toBe("ckp1");
    expect(articulo.codigoInterno).toBe("7791234");
    expect(articulo.codigoBarras).toBe("7791234");
    expect(articulo.descripcion).toBe("Coca Cola 2,25 L");
    expect(articulo.costoNeto.aDecimalString()).toBe("1500.00");
    expect(articulo.alicuotaIva?.porcentaje).toBe(21);
    expect(articulo.activo).toBe(true);
  });

  it("arma el precio manual de la lista por defecto con `precioVenta`", () => {
    const { precio } = mapearProducto(remoto);
    expect(precio.articuloId).toBe("ckp1");
    expect(precio.modo).toBe(ModoPrecio.Manual);
    expect(precio.precioManual?.aDecimalString()).toBe("2500.00");
  });
});
