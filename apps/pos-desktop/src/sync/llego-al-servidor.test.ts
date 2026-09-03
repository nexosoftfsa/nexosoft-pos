import { describe, expect, it } from "vitest";

import type { ResumenSync } from "@nexosoft/sync";

import { llegoAlServidor } from "./llego-al-servidor";

function resumen(resultados: ResumenSync["resultados"]): ResumenSync {
  return { enviadas: 0, completadas: 0, fallidas: 0, pendientes: 0, resultados };
}

describe("llegoAlServidor", () => {
  it("una venta aceptada prueba que llegamos", () => {
    expect(llegoAlServidor(resumen({ "op-1": { ok: true, idRemoto: "v1" } }))).toBe(true);
  });

  /**
   * Sin red, `MotorDeSincronizacion` marca TODAS reintentables con el mismo
   * mensaje y no lanza. Ésa es la única forma de distinguirlo desde afuera.
   */
  it("todas reintentables = no hubo respuesta", () => {
    expect(
      llegoAlServidor(
        resumen({
          "op-1": { ok: false, error: "No se pudo conectar", reintentable: true },
          "op-2": { ok: false, error: "No se pudo conectar", reintentable: true },
        }),
      ),
    ).toBe(false);
  });

  it("un rechazo definitivo también prueba que llegamos: sólo el servidor lo dice", () => {
    expect(
      llegoAlServidor(
        resumen({ "op-1": { ok: false, error: "Producto inexistente", reintentable: false } }),
      ),
    ).toBe(true);
  });

  it("mezcla: alcanza con una resuelta", () => {
    expect(
      llegoAlServidor(
        resumen({
          "op-1": { ok: false, error: "No se pudo conectar", reintentable: true },
          "op-2": { ok: true, idRemoto: "v2" },
        }),
      ),
    ).toBe(true);
  });

  /**
   * Un lote vacío no prueba nada. Devuelve `false`, pero quien llama no lo usa
   * en ese caso: `useSync` sólo toca el estado cuando hubo algo que enviar, y
   * con la cola vacía "Sincronizado" es la verdad aunque el servidor no esté.
   */
  it("un lote vacío devuelve false y quien llama lo ignora", () => {
    expect(llegoAlServidor(resumen({}))).toBe(false);
  });
});
