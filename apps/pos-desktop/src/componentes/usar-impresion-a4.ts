/** Fase 10.4: imprimir un comprobante en A4. Ver `usar-impresion.ts`. */
import type { DatosTicket } from "@nexosoft/hardware";
import { useImpresion } from "./usar-impresion";

export function useImpresionA4(): {
  readonly datosA4: DatosTicket | null;
  readonly imprimirA4: (datos: DatosTicket) => void;
} {
  const { datos, imprimir } = useImpresion<DatosTicket>("modo-impresion-a4");
  return { datosA4: datos, imprimirA4: imprimir };
}
