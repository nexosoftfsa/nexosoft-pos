/** Fase 10.5: imprimir una hoja de etiquetas de góndola. Ver `usar-impresion.ts`. */
import type { EtiquetaAImprimir } from "./EtiquetaGondola";
import { useImpresion } from "./usar-impresion";

export function useImpresionEtiquetas(): {
  readonly etiquetas: readonly EtiquetaAImprimir[] | null;
  readonly imprimirEtiquetas: (etiquetas: readonly EtiquetaAImprimir[]) => void;
} {
  const { datos, imprimir } = useImpresion<readonly EtiquetaAImprimir[]>("modo-impresion-etiquetas");
  return { etiquetas: datos, imprimirEtiquetas: imprimir };
}
