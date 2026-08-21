/** Vista previa/impresión de la credencial física de empleado (80mm×50mm, Fase 15.A). Ver `usar-impresion.ts`. */
import { useImpresion } from "./usar-impresion";

export interface DatosCredencial {
  readonly nombreDisplay: string;
  readonly rol: string;
  readonly fotoDataUrl?: string;
  /** Payload crudo del código de barras, ej. "NXSCRED:{usuarioId}:{token}". */
  readonly payloadBarcode: string;
  /** Razón social del comercio. Sin esto, la credencial muestra "Nexosoft". */
  readonly razonSocial?: string;
  /** Logo del comercio. Sin esto, la credencial muestra el logo de Nexosoft. */
  readonly logoDataUrl?: string;
}

export function useImpresionCredencial(): {
  readonly datosCredencial: DatosCredencial | null;
  readonly imprimirCredencial: (datos: DatosCredencial) => void;
} {
  const { datos, imprimir } = useImpresion<DatosCredencial>("modo-impresion-credencial");
  return { datosCredencial: datos, imprimirCredencial: imprimir };
}
