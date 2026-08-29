/**
 * Genera el QR fiscal ANTES de imprimir.
 *
 * Antes el QR se armaba dentro del componente, en un `useEffect` que importaba
 * `qrcode` y esperaba una promesa. Pero `useImpresion` llama a `window.print()`
 * de forma sincrónica apenas renderiza: cuando Windows sacaba la foto de la
 * página, la imagen del QR todavía no existía y el componente devolvía `null`.
 * El comprobante salía sin QR aunque tuviera CAE, y encima el alto del papel se
 * medía sin él, así que el ticket salía corto.
 *
 * Por eso el QR se calcula acá, se espera, y recién entonces se manda a
 * imprimir. `QrFiscal` quedó como un render puro de una imagen ya lista.
 */
import { llevaQrFiscal, urlQrArca } from "@nexosoft/domain";
import type { DatosTicket } from "@nexosoft/hardware";

/** `DatosTicket` con el QR ya resuelto, listo para pintar sin esperar nada. */
export type DatosImpresion = DatosTicket & {
  /** Imagen del QR como data URL. Ausente si el comprobante no lleva QR. */
  readonly qrDataUrl?: string;
};

/** Lado del QR en píxeles. El doble de lo que se muestra, para que imprima nítido. */
const LADO_PX = 220;

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
 * Devuelve los datos con el QR ya generado. Si no corresponde —o si falla la
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
    const { default: QRCode } = await import("qrcode");
    const qrDataUrl = await QRCode.toDataURL(url, {
      width: LADO_PX,
      margin: 0,
      errorCorrectionLevel: "M",
    });
    return { ...datos, qrDataUrl };
  } catch {
    return datos;
  }
}
