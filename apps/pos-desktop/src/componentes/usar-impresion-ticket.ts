/** Vista previa/impresión del ticket chico (formato rollo térmico). Ver `usar-impresion.ts`. */
import type { DatosTicket } from "@nexosoft/hardware";
import { useImpresion } from "./usar-impresion";

export function useImpresionTicket(): {
  readonly datosTicket: DatosTicket | null;
  readonly imprimirTicketPreview: (datos: DatosTicket) => void;
} {
  const { datos, imprimir } = useImpresion<DatosTicket>("modo-impresion-ticket");
  return { datosTicket: datos, imprimirTicketPreview: imprimir };
}
