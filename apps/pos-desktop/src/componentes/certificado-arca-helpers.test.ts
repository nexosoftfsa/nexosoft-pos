import { describe, expect, it } from "vitest";

import { nombreDelCertificado } from "./CertificadoArca";

/**
 * En ARCA el permiso para facturar se le otorga a UN certificado, no al CUIT.
 * Si el comercio autoriza otro —por ejemplo uno que generó antes por su
 * cuenta— el nuestro sigue sin permiso, y el rechazo llega mucho después sin
 * mencionar la causa. Por eso el nombre tiene que estar a la vista para poder
 * compararlo contra la pantalla de ARCA.
 */
describe("nombreDelCertificado", () => {
  it("saca el CN del subject", () => {
    expect(
      nombreDelCertificado(
        "C=AR, O=Rivarola Sergio Sebastian, CN=NexoSoft-Rivarola, serialNumber=CUIT 20356780079",
      ),
    ).toBe("NexoSoft-Rivarola");
  });

  it("funciona con el CN al final", () => {
    expect(nombreDelCertificado("C=AR, O=Comercio, CN=sebastianprueba")).toBe("sebastianprueba");
  });

  it("no se lleva lo que viene después de la coma", () => {
    const r = nombreDelCertificado("CN=uno, serialNumber=CUIT 20356780079");
    expect(r).toBe("uno");
    expect(r).not.toContain("serialNumber");
  });

  it("devuelve null si no hay CN", () => {
    expect(nombreDelCertificado("C=AR, O=Comercio")).toBeNull();
    expect(nombreDelCertificado("")).toBeNull();
  });
});
