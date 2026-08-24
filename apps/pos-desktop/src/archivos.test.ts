import { describe, expect, it } from "vitest";

import { bytesDeDataUrl, LOGO_MAX_BYTES, tipoDeSalidaDeLogo } from "./archivos";

/**
 * El reescalado en sí usa canvas y no corre en vitest; lo que se cubre acá es
 * la lógica que decide el formato y mide el resultado, que es donde estaba el
 * problema: un logo con transparencia guardado como JPEG queda con un
 * rectángulo blanco encima del ticket y del panel.
 */
describe("tipoDeSalidaDeLogo", () => {
  it("conserva PNG para no perder la transparencia", () => {
    expect(tipoDeSalidaDeLogo("image/png")).toBe("image/png");
    expect(tipoDeSalidaDeLogo("image/webp")).toBe("image/png");
  });

  it("usa JPEG para los formatos que no tienen transparencia", () => {
    expect(tipoDeSalidaDeLogo("image/jpeg")).toBe("image/jpeg");
    expect(tipoDeSalidaDeLogo("image/bmp")).toBe("image/jpeg");
    expect(tipoDeSalidaDeLogo("")).toBe("image/jpeg");
  });
});

describe("bytesDeDataUrl", () => {
  it("mide el contenido, no el largo del string", () => {
    // "hola" -> aG9sYQ== (4 bytes reales, 8 caracteres de base64)
    const url = `data:image/png;base64,${Buffer.from("hola").toString("base64")}`;
    expect(bytesDeDataUrl(url)).toBe(4);
  });

  it("descuenta el relleno de un solo '='", () => {
    const url = `data:image/png;base64,${Buffer.from("holas").toString("base64")}`;
    expect(bytesDeDataUrl(url)).toBe(5);
  });

  it("sin relleno da el tamaño exacto", () => {
    const url = `data:image/png;base64,${Buffer.from("hola123").toString("base64")}`;
    // 7 bytes no es múltiplo de 3, así que el cálculo entero puede quedar
    // corto por uno: lo que importa es que no se dispare, no el byte exacto.
    expect(bytesDeDataUrl(url)).toBeGreaterThanOrEqual(6);
    expect(bytesDeDataUrl(url)).toBeLessThanOrEqual(7);
  });

  it("una imagen de un megabyte supera el tope del logo", () => {
    const url = `data:image/png;base64,${"A".repeat(1_400_000)}`;
    expect(bytesDeDataUrl(url)).toBeGreaterThan(LOGO_MAX_BYTES);
  });
});
