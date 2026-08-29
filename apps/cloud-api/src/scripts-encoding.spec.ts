import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Windows PowerShell 5.1 lee un `.ps1` SIN BOM como Windows-1252, no como
 * UTF-8. Un guión largo («—», que en UTF-8 son tres bytes) se decodifica
 * entonces como `â€"`, y ese último byte es la comilla tipográfica de cierre
 * `”` — que el parser de PowerShell acepta como terminador de string. El
 * archivo deja de compilar entero, y el error aparece 30 líneas más abajo, en
 * una línea que no tiene nada malo.
 *
 * Pasó de verdad: `asegurar-env.ps1` no arrancaba por un guión largo dentro de
 * un comentario. Peor: `Parser::ParseFile` de .NET decodifica como UTF-8, así
 * que el chequeo de sintaxis daba OK sobre un archivo que powershell.exe no
 * puede leer.
 *
 * La regla es simple: un `.ps1` puede tener acentos, pero entonces tiene que
 * tener BOM. Sin BOM, sólo ASCII.
 */
const RAIZ = join(__dirname, '..', '..', '..');
const CARPETAS = ['scripts'];

function archivosPs1(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const completo = join(dir, entrada);
    if (statSync(completo).isDirectory()) salida.push(...archivosPs1(completo));
    else if (entrada.toLowerCase().endsWith('.ps1')) salida.push(completo);
  }
  return salida;
}

/** Carpetas de código fuente donde se busca texto ya corrompido. */
const FUENTES = ['apps/cloud-api/src', 'apps/pos-desktop/src', 'apps/admin-web/src', 'packages'];

function archivosFuente(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    if (entrada === 'node_modules' || entrada === 'dist') continue;
    const completo = join(dir, entrada);
    if (statSync(completo).isDirectory()) salida.push(...archivosFuente(completo));
    else if (/\.(ts|tsx)$/.test(entrada) && !entrada.endsWith('scripts-encoding.spec.ts')) {
      salida.push(completo);
    }
  }
  return salida;
}

/**
 * Rastro de un texto UTF-8 que alguien leyó como Windows-1252 y volvió a
 * guardar como UTF-8: `ó` queda como `Ã³`, `°` como `Â°`, `—` como `â€"`.
 *
 * No es teórico. `ComprobanteA4.tsx` tenía `<th>DescripciÃ³n</th>` guardado así
 * en el repo, y como ese componente sólo se renderiza al imprimir, nadie lo vio
 * hasta que salió impreso en una factura con CAE real.
 */
const MOJIBAKE = /Ã[©³¡­º±ƒ]|Â[°¡¿]|â€/;

describe('los scripts de PowerShell los puede leer Windows PowerShell 5.1', () => {
  const archivos = CARPETAS.flatMap((c) => archivosPs1(join(RAIZ, c)));

  it('hay scripts para revisar', () => {
    expect(archivos.length).toBeGreaterThan(0);
  });

  it.each(archivos.map((a) => [a.slice(RAIZ.length + 1), a]))(
    '%s: con acentos lleva BOM, o es ASCII puro',
    (_relativo, ruta) => {
      const bytes = readFileSync(ruta);
      const tieneBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
      if (tieneBom) return;
      const noAscii = bytes.filter((b) => b > 127).length;
      expect(
        noAscii,
        'sin BOM, PowerShell 5.1 lo lee como Windows-1252 y los acentos lo pueden romper. ' +
          'Guardalo como UTF-8 con BOM, o sacale los caracteres no ASCII.',
      ).toBe(0);
    },
  );
});

describe('el código fuente no tiene texto ya corrompido', () => {
  const archivos = FUENTES.flatMap((c) => archivosFuente(join(RAIZ, c)));

  it('hay archivos para revisar', () => {
    expect(archivos.length).toBeGreaterThan(0);
  });

  it('ningún archivo tiene acentos mal codificados', () => {
    const rotos = archivos
      .filter((a) => MOJIBAKE.test(readFileSync(a, 'utf8')))
      .map((a) => a.slice(RAIZ.length + 1));

    expect(
      rotos,
      'Estos archivos tienen texto UTF-8 leído como Windows-1252 y vuelto a guardar ' +
        '("Descripción" quedó como "DescripciÃ³n"). Suele pasar al editarlos con una ' +
        'herramienta que no respeta la codificación. Reabrilos como UTF-8 y corregí el texto.',
    ).toEqual([]);
  });
});
