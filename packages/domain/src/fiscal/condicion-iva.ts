/**
 * Condición frente al IVA (ARCA) de emisor y receptor.
 *
 * Determina, junto con `resolverTipoComprobante`, qué comprobante se emite y si
 * el IVA se discrimina (ver [[tipo-comprobante]] y ADR-0012).
 */

export const CondicionIva = {
  ResponsableInscripto: "ResponsableInscripto",
  Monotributo: "Monotributo",
  ConsumidorFinal: "ConsumidorFinal",
  Exento: "Exento",
  NoCategorizado: "NoCategorizado",
} as const;

export type CondicionIva = (typeof CondicionIva)[keyof typeof CondicionIva];

export const CONDICIONES_IVA: readonly CondicionIva[] = Object.values(CondicionIva);

/** Etiqueta legible para UI/comprobantes. */
export function etiquetaCondicionIva(c: CondicionIva): string {
  switch (c) {
    case CondicionIva.ResponsableInscripto:
      return "Responsable Inscripto";
    case CondicionIva.Monotributo:
      return "Responsable Monotributo";
    case CondicionIva.ConsumidorFinal:
      return "Consumidor Final";
    case CondicionIva.Exento:
      return "IVA Exento";
    case CondicionIva.NoCategorizado:
      return "No Categorizado";
  }
}

/** Condiciones que el comercio (emisor) puede tener configuradas en el MVP. */
export const CONDICIONES_EMISOR_VALIDAS: readonly CondicionIva[] = [
  CondicionIva.ResponsableInscripto,
  CondicionIva.Monotributo,
];
