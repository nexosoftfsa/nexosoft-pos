/**
 * Genera el QR fiscal ANTES de imprimir, y como SVG en línea.
 *
 * Dos problemas encadenados, los dos por lo mismo: `useImpresion` llama a
 * `window.print()` de forma sincrónica apenas renderiza, y no espera nada.
 *
 * 1. El QR se armaba dentro del componente, en un `useEffect` asíncrono. Cuando
 *    se imprimía, la imagen todavía no existía y salía sin QR.
 * 2. Precalcular el data URL no alcanzó: un `<img>` igual tiene que DECODIFICAR
 *    la imagen antes de pintarla, y eso también es asíncrono. El comprobante
 *    salía con el recuadro del QR vacío.
 *
 * Por eso el QR viaja como el `d` de un `<path>` de SVG. Un SVG en línea es
 * parte del DOM: se dibuja junto con el resto del layout, sin ninguna carga
 * intermedia que esperar.
 */
import { llevaQrFiscal, urlQrArca } from "@nexosoft/domain";
import type { DatosTicket } from "@nexosoft/hardware";

/** `DatosTicket` con el QR ya resuelto, listo para pintar sin esperar nada. */
export type DatosImpresion = DatosTicket & {
  /** Path SVG del QR y lado de su `viewBox`, en módulos. */
  readonly qr?: { readonly path: string; readonly lado: number };
};

/** Zona silenciosa que pide la norma, en módulos. Sin ella muchos lectores no enganchan. */
const MARGEN = 4;

/**
 * ¿Este comprobante lleva QR?
 *
 * Hacen falta las dos cosas: el CAE y el código de tipo de comprobante de ARCA
 * —el código va adentro de lo que se codifica—. Un ticket interno, o uno que
 * todavía espera autorización, no lleva: imprimir un QR inventado sería peor
 * que no imprimirlo.
 */
export function llevaQr(datos: DatosTicket): boolean {
  return llevaQrFiscal(datos.cae) && typeof datos.codigoComprobanteArca === "number";
}

/**
 * Arma el `d` de un único `<path>` con todos los módulos oscuros.
 *
 * Un path solo en vez de un `<rect>` por módulo: un QR grande tiene miles de
 * módulos y eso serían miles de nodos en el DOM.
 */
export function pathDeModulos(
  modulos: { readonly size: number; readonly data: Uint8Array | readonly number[] },
): string {
  const partes: string[] = [];
  for (let fila = 0; fila < modulos.size; fila++) {
    for (let col = 0; col < modulos.size; col++) {
      if (modulos.data[fila * modulos.size + col] === 0) continue;
      partes.push(`M${col + MARGEN} ${fila + MARGEN}h1v1h-1z`);
    }
  }
  return partes.join("");
}

/**
 * Devuelve los datos con el QR ya resuelto. Si no corresponde —o si falla la
 * generación— devuelve los datos tal cual: un comprobante sin QR es mejor que
 * una impresión que no sale.
 */
export async function conQrFiscal(datos: DatosTicket): Promise<DatosImpresion> {
  if (!llevaQr(datos)) return datos;

  try {
    const url = urlQrArca({
      fecha: datos.fecha,
      cuit: datos.cuit,
      puntoDeVenta: datos.puntoDeVenta,
      tipoComprobante: datos.codigoComprobanteArca as number,
      numeroComprobante: datos.numero,
      importe: datos.total.aDecimalString(2),
      cae: datos.cae as string,
    });
    // `qrcode` se importa sólo cuando hace falta: no encarece el arranque del
    // POS, que es lo primero que ve el cajero a la mañana.
    const { create } = await import("qrcode");
    const { modules } = create(url, { errorCorrectionLevel: "M" });
    return {
      ...datos,
      qr: { path: pathDeModulos(modules), lado: modules.size + MARGEN * 2 },
    };
  } catch {
    return datos;
  }
}
