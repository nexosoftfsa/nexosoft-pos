import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { REGLA_PAGINA_A4 } from "./usar-impresion-a4";

/**
 * El PDF de un comprobante fiscal salía con la fecha de impresión, el título de
 * la ventana y `tauri.localhost` impresos en el margen: los escribe Chromium
 * cuando el margen de la `@page` es el global de 15mm. Poner el margen en cero
 * los saca, pero entonces la hoja tiene que ponerse su propio margen o el
 * texto queda pegado al borde del papel.
 *
 * Son dos mitades de un mismo cambio y viven en archivos distintos, así que se
 * fijan juntas: si alguien toca una sin la otra, que falle acá.
 */
describe("el margen del A4", () => {
  const css = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../estilos.css"),
    "utf8",
  );

  /** El bloque de `.hoja-a4` que rige mientras se imprime. */
  const reglaDeImpresion = (() => {
    const m = /body\.modo-impresion-a4 \.hoja-a4 \{([^}]*)\}/.exec(css);
    return m?.[1] ?? "";
  })();

  it("pone la página en A4 con el margen en cero", () => {
    expect(REGLA_PAGINA_A4).toMatch(/size:\s*A4/);
    expect(REGLA_PAGINA_A4).toMatch(/margin:\s*0\b/);
  });

  it("y la hoja se pone su propio margen con padding", () => {
    expect(reglaDeImpresion, "no encontré la regla de impresión de .hoja-a4").not.toBe("");
    expect(reglaDeImpresion).toMatch(/padding:\s*15mm/);
    expect(reglaDeImpresion).toMatch(/box-sizing:\s*border-box/);
  });

  it("que se repite en cada página: una venta larga no deja la segunda pegada al borde", () => {
    // Verificado con un documento de 60 renglones renderizado a PDF: sin
    // `clone`, la segunda página arrancaba en el borde superior.
    expect(reglaDeImpresion).toMatch(/box-decoration-break:\s*clone/);
  });

  it("el margen global de 15mm sigue ahí, para lo que imprime directo", () => {
    // Presupuestos y Remitos llaman a window.print() sin hoja propia y
    // dependen de este margen. No se cambió para sacar los encabezados del A4.
    expect(css).toMatch(/@page\s*\{\s*size:\s*A4;\s*margin:\s*15mm;\s*\}/);
  });
});
