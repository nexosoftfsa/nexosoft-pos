/** Fase 10.4: imprimir un comprobante en A4. Ver `usar-impresion.ts`. */
import { useCallback } from "react";

import type { DatosTicket } from "@nexosoft/hardware";
import { conQrFiscal, type DatosImpresion } from "./qr-fiscal-datos";
import { useImpresion } from "./usar-impresion";

export function useImpresionA4(): {
  readonly datosA4: DatosImpresion | null;
  readonly imprimirA4: (datos: DatosTicket) => Promise<void>;
} {
  const { datos, imprimir } = useImpresion<DatosImpresion>("modo-impresion-a4");

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
