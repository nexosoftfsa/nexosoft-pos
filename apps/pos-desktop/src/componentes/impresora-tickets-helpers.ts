import type { ImpresoraDelSistema } from "../datos/impresora-escpos";

/** Valor del `<select>` que significa "la predeterminada de Windows". */
export const IMPRESORA_PREDETERMINADA = "";

/**
 * Cómo se lee cada impresora en la lista.
 *
 * El puerto va entre paréntesis porque es lo que distingue dos impresoras con
 * nombre parecido, y porque en el caso que nos rompió (`PORTPROMPT:`) es
 * justamente el dato que delata a la virtual.
 */
export function etiquetaImpresora(i: ImpresoraDelSistema): string {
  const partes = [i.nombre];
  if (i.puerto !== "") partes.push(`(${i.puerto})`);
  if (i.predeterminada) partes.push("· predeterminada de Windows");
  if (!i.sirveParaTicket) partes.push("· no sirve para tickets");
  return partes.join(" ");
}

/**
 * Aviso a mostrar según a dónde está saliendo el ticket, o `null` si está bien.
 *
 * Los dos casos malos son distintos y hay que decirlos distinto: elegir a mano
 * una impresora virtual es un error visible, pero *no elegir nada* y que la
 * predeterminada de Windows resulte ser "Microsoft Print to PDF" es el que ya
 * nos pasó — el POS decía que imprimía y el ticket terminaba en un archivo.
 */
export function avisoDeImpresora(
  elegida: string,
  instaladas: readonly ImpresoraDelSistema[],
): string | null {
  if (instaladas.length === 0) return null;

  if (elegida !== IMPRESORA_PREDETERMINADA) {
    const i = instaladas.find((x) => x.nombre === elegida);
    if (i === undefined) {
      return `La impresora configurada ("${elegida}") ya no está instalada en esta PC. Elegí otra.`;
    }
    return i.sirveParaTicket
      ? null
      : `"${i.nombre}" es una impresora virtual: guarda el ticket en un archivo en vez de imprimirlo. Elegí la impresora térmica.`;
  }

  const porDefecto = instaladas.find((x) => x.predeterminada);
  if (porDefecto === undefined) return null;
  if (porDefecto.sirveParaTicket) return null;
  return `La impresora predeterminada de Windows es "${porDefecto.nombre}", que guarda el ticket en un archivo en vez de imprimirlo. Elegí la impresora térmica en la lista.`;
}

/**
 * Bytes ESC/POS de la prueba de impresión: inicializar, una línea de texto,
 * avanzar el papel y cortar.
 *
 * Es a propósito lo más corto posible y sin logo: lo que se está probando es
 * que los bytes lleguen a una impresora que los entienda, no el formato del
 * ticket. Si esto sale en papel, el circuito está bien.
 */
export function bytesPruebaImpresion(ahora: Date = new Date()): number[] {
  const texto =
    "NexoSoft\nPrueba de impresion\n" +
    `${ahora.toLocaleDateString("es-AR")} ${ahora.toLocaleTimeString("es-AR")}\n` +
    "Si lee esto, la impresora esta bien.\n";
  const ESC = 0x1b;
  const GS = 0x1d;
  return [
    ESC,
    0x40, // ESC @ : inicializar
    ...Array.from(texto, (c) => c.charCodeAt(0) & 0x7f),
    0x0a,
    0x0a,
    0x0a,
    GS,
    0x56,
    0x00, // GS V 0 : corte
  ];
}
