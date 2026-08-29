/** Vista previa/impresión del ticket chico (formato rollo térmico). Ver `usar-impresion.ts`. */
import { useCallback, useMemo } from "react";

import type { DatosTicket } from "@nexosoft/hardware";
import { conQrFiscal, type DatosImpresion } from "./qr-fiscal-datos";
import { useImpresion, type PaginaAMedida } from "./usar-impresion";

/**
 * Ancho imprimible del rollo, en mm. 48mm es el área útil de una térmica de
 * 58mm (el driver la muestra como "58(48) x ... mm"). Para una de 80mm, el
 * área útil ronda los 72mm. Tiene que coincidir con `.hoja-ticket { width }`
 * en `estilos.css`, porque el alto de la página se mide a este ancho.
 */
export const ANCHO_TICKET_MM = 48;

export function useImpresionTicket(): {
  readonly datosTicket: DatosImpresion | null;
  readonly imprimirTicketPreview: (datos: DatosTicket) => Promise<void>;
} {
  const pagina = useMemo<PaginaAMedida>(
    () => ({
      anchoMm: ANCHO_TICKET_MM,
      selector: ".hoja-ticket",
      // Unos mm de cola para que el corte no se coma la última línea.
      colaMm: 5,
    }),
    [],
  );
  const { datos, imprimir } = useImpresion<DatosImpresion>("modo-impresion-ticket", pagina);

  // El QR se resuelve ANTES de imprimir. Además de que `window.print()` no
  // espera promesas, el alto del papel se mide sobre el nodo ya renderizado:
  // sin el QR presente, el ticket salía cortado.
  const imprimirTicketPreview = useCallback(
    async (d: DatosTicket) => {
      imprimir(await conQrFiscal(d));
    },
    [imprimir],
  );

  return { datosTicket: datos, imprimirTicketPreview };
}
