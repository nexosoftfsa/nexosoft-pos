/**
 * Verificación de las columnas de un Excel ANTES de intentar importarlo.
 *
 * Nació de un caso real: alguien intentó importar un archivo que no era el
 * export de artículos y recibió 25 veces el mismo mensaje —"Fila sin código"—
 * sin ninguna pista de qué estaba mal. El error era correcto y completamente
 * inútil: la columna del código no existía en ese archivo, y el sistema lo
 * descubría fila por fila en vez de decirlo una vez, al principio.
 */

/**
 * Normaliza un encabezado para compararlo: sin acentos, sin mayúsculas, sin
 * espacios de más. Así "CODIGO DE BARRAS" y "Código de Barras" cuentan como
 * la misma columna — el archivo del comercio casi nunca respeta la
 * capitalización exacta, y hacerlo fallar por eso es gratuito.
 */
export function normalizarEncabezado(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export interface RevisionColumnas {
  /** Columnas esperadas que no están en el archivo, con su nombre "lindo". */
  readonly faltantes: readonly string[];
  /**
   * Cómo mapear cada columna esperada al encabezado REAL del archivo, para
   * los casos en que sólo cambia la capitalización o los acentos.
   */
  readonly equivalencias: ReadonlyMap<string, string>;
}

/**
 * Compara los encabezados del archivo contra los que espera el importador.
 * Sólo `requeridas` produce un error; el resto puede faltar.
 */
export function revisarColumnas(
  encabezados: readonly string[],
  esperadas: readonly string[],
  requeridas: readonly string[],
): RevisionColumnas {
  const porNormalizado = new Map<string, string>();
  for (const e of encabezados) {
    const clave = normalizarEncabezado(e);
    if (clave !== "" && !porNormalizado.has(clave)) porNormalizado.set(clave, e);
  }

  const equivalencias = new Map<string, string>();
  for (const esperada of esperadas) {
    const real = porNormalizado.get(normalizarEncabezado(esperada));
    if (real !== undefined) equivalencias.set(esperada, real);
  }

  const faltantes = requeridas.filter((r) => !equivalencias.has(r));
  return { faltantes, equivalencias };
}

/**
 * Renombra las claves de cada fila al nombre exacto que espera el importador.
 * Sin esto, un archivo con "CODIGO DE BARRAS" pasaría la revisión y después
 * fallaría igual, porque el backend busca la clave literal.
 */
export function normalizarFilas(
  filas: readonly Record<string, string>[],
  equivalencias: ReadonlyMap<string, string>,
): Record<string, string>[] {
  return filas.map((fila) => {
    const nueva: Record<string, string> = { ...fila };
    for (const [esperada, real] of equivalencias) {
      if (real !== esperada && real in fila) nueva[esperada] = fila[real] ?? "";
    }
    return nueva;
  });
}

/**
 * Mensaje para el usuario cuando faltan columnas. Dice qué falta, qué tiene
 * el archivo, y —lo que más ayuda— sugiere la confusión más probable.
 */
export function mensajeColumnasFaltantes(
  nombreArchivo: string,
  faltantes: readonly string[],
  encabezados: readonly string[],
): string {
  const falta =
    faltantes.length === 1
      ? `le falta la columna «${faltantes[0]}»`
      : `le faltan estas columnas: ${faltantes.map((f) => `«${f}»`).join(", ")}`;
  const tiene = encabezados.filter((e) => e !== "").join(", ") || "(ninguna que se pueda leer)";
  return (
    `A "${nombreArchivo}" ${falta}.\n\n` +
    `Las columnas que tiene el archivo son: ${tiene}.\n\n` +
    `Revisá que sea el archivo correcto: el export de Stock y el de Artículos ` +
    `NO son intercambiables, y un listado bajado de otro sistema casi nunca ` +
    `tiene los mismos encabezados. Podés usar "Exportar artículos" para ver el ` +
    `formato exacto que espera la importación.`
  );
}
