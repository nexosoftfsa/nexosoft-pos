import { describe, expect, it } from "vitest";

import { ErrorFiscal, TipoComprobante } from "@nexosoft/domain";

import {
  ArcaServicioFiscal,
  codigoComprobanteArca,
  type ConfiguracionArca,
} from "./arca-servicio-fiscal.js";
import type { SolicitudCae } from "./servicio-fiscal.js";

describe("codigoComprobanteArca (CbteTipo de WSFEv1)", () => {
  it("mapea facturas", () => {
    expect(codigoComprobanteArca(TipoComprobante.FacturaA)).toBe(1);
    expect(codigoComprobanteArca(TipoComprobante.FacturaB)).toBe(6);
    expect(codigoComprobanteArca(TipoComprobante.FacturaC)).toBe(11);
  });

  it("mapea notas de crédito y débito", () => {
    expect(codigoComprobanteArca(TipoComprobante.NotaCreditoA)).toBe(3);
    expect(codigoComprobanteArca(TipoComprobante.NotaCreditoB)).toBe(8);
    expect(codigoComprobanteArca(TipoComprobante.NotaCreditoC)).toBe(13);
    expect(codigoComprobanteArca(TipoComprobante.NotaDebitoA)).toBe(2);
    expect(codigoComprobanteArca(TipoComprobante.NotaDebitoC)).toBe(12);
  });

  it("rechaza comprobantes no fiscales", () => {
    expect(() => codigoComprobanteArca(TipoComprobante.Remito)).toThrow(ErrorFiscal);
  });
});

describe("ArcaServicioFiscal", () => {
  const config: ConfiguracionArca = {
    cuit: "30-71234567-8",
    entorno: "homologacion",
    certificadoPath: "/secrets/cert.crt",
    clavePrivadaPath: "/secrets/cert.key",
  };

  it("resuelve los endpoints según el entorno", () => {
    expect(new ArcaServicioFiscal(config).endpoints.wsaa).toContain("wsaahomo");
    expect(new ArcaServicioFiscal({ ...config, entorno: "produccion" }).endpoints.wsfev1).toContain(
      "servicios1.afip",
    );
  });

  it("avisa que el adaptador real no está implementado", async () => {
    const fiscal = new ArcaServicioFiscal(config);
    const solicitud = { tipoComprobante: TipoComprobante.FacturaB } as SolicitudCae;
    await expect(fiscal.solicitarCae(solicitud)).rejects.toBeInstanceOf(ErrorFiscal);
    await expect(fiscal.ultimoNumeroAutorizado(1, TipoComprobante.FacturaB)).rejects.toThrow(
      /no implementado/i,
    );
  });
});
