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
