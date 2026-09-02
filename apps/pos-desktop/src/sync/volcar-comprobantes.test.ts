import { describe, expect, it, vi } from "vitest";

import type { ResumenSync } from "@nexosoft/sync";

import { volcarComprobantes } from "./volcar-comprobantes";

function repoFalso() {
  return {
    guardar: vi.fn(),
    actualizarCae: vi.fn(),
    siguienteNumero: vi.fn(),
    vincularOperacion: vi.fn(),
    aplicarResueltoPorElServidor: vi.fn().mockResolvedValue(undefined),
    ultimas: vi.fn(),
  };
}

const AUTORIZADA: ResumenSync["resultados"] = {
  "op-1": {
    ok: true,
    idRemoto: "v1",
    comprobante: {
      numeroComprobante: 4,
      tipoComprobante: "FacturaC",
      cae: "86351023067383",
      caeFechaVto: "2026-09-12T00:00:00.000Z",
      estadoFiscal: "AUTORIZADA",
    },
  },
};

describe("volcarComprobantes", () => {
  it("le pasa a la venta local el número de ARCA y el CAE", async () => {
    const repo = repoFalso();
    await volcarComprobantes(repo as never, AUTORIZADA);

    expect(repo.aplicarResueltoPorElServidor).toHaveBeenCalledWith("op-1", {
      numeroFiscal: 4,
      tipoComprobante: "FacturaC",
      cae: "86351023067383",
      vencimientoCae: new Date("2026-09-12T00:00:00.000Z"),
      estadoFiscal: "AUTORIZADA",
    });
  });

  it("una operación que falló no toca nada", async () => {
    const repo = repoFalso();
    await volcarComprobantes(repo as never, {
      "op-1": { ok: false, error: "sin conexión", reintentable: true },
    });

    expect(repo.aplicarResueltoPorElServidor).not.toHaveBeenCalled();
  });

  it("una operación aceptada sin comprobante tampoco", async () => {
    const repo = repoFalso();
    await volcarComprobantes(repo as never, { "op-1": { ok: true, idRemoto: "v1" } });

    expect(repo.aplicarResueltoPorElServidor).not.toHaveBeenCalled();
  });

  it("una venta que el servidor dejó pendiente se vuelca igual, sin número", async () => {
    const repo = repoFalso();
    await volcarComprobantes(repo as never, {
      "op-2": {
        ok: true,
        comprobante: {
          numeroComprobante: null,
          tipoComprobante: "FacturaC",
          cae: null,
          caeFechaVto: null,
          estadoFiscal: "PENDIENTE",
        },
      },
    });

    expect(repo.aplicarResueltoPorElServidor).toHaveBeenCalledWith("op-2", {
      numeroFiscal: null,
      tipoComprobante: "FacturaC",
      cae: null,
      vencimientoCae: null,
      estadoFiscal: "PENDIENTE",
    });
  });
});
