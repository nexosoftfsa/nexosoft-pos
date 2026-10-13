/** Fase 10.4: imprimir un comprobante en A4. Ver `usar-impresion.ts`. */
import { useCallback } from "react";

import type { DatosTicket } from "@nexosoft/hardware";
import { conQrFiscal, type DatosImpresion } from "./qr-fiscal-datos";
import { useImpresion } from "./usar-impresion";

/**
 * Margen cero para que Chromium no escriba en él: con 15mm, el PDF de un
 * comprobante fiscal salía con la fecha de impresión, el título de la ventana y
 * `tauri.localhost`. El margen de verdad lo pone la hoja con `padding`, y se
 * repite en cada página gracias a `box-decoration-break: clone` (ver
 * `.hoja-a4`), así que una venta larga no deja la segunda página pegada al
 * borde. Verificado con un documento de 60 renglones antes de aplicarlo.
 */
export const REGLA_PAGINA_A4 = "@page { size: A4; margin: 0; }";

export function useImpresionA4(): {
  readonly datosA4: DatosImpresion | null;
  readonly imprimirA4: (datos: DatosTicket) => Promise<void>;
} {
  const { datos, imprimir } = useImpresion<DatosImpresion>(
    "modo-impresion-a4",
    undefined,
    REGLA_PAGINA_A4,
  );

  // El QR se resuelve ANTES de imprimir: `window.print()` no espera promesas,
  // así que un QR que se genera después no llega a la hoja.
  const imprimirA4 = useCallback(
    async (d: DatosTicket) => {
      imprimir(await conQrFiscal(d));
    },
    [imprimir],
  );

  return { datosA4: datos, imprimirA4 };
}
