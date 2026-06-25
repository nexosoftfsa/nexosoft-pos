/**
 * Alícuotas de IVA vigentes en Argentina, con su código en ARCA (WSFEv1).
 *
 * El `porcentaje` es una constante exacta de tasa (no es dinero), por eso es un
 * `number`. El cálculo del importe de IVA sobre una base se hace siempre con
 * `Money` (ver `Money.porcentaje`). El `codigoArca` se usará en Fase 2 (emisión).
 */

export interface AlicuotaIva {
  /** Id de alícuota en WSFEv1 (3=0%, 4=10,5%, 5=21%, 6=27%, 8=5%, 9=2,5%). */
  readonly codigoArca: number;
  /** Tasa en porcentaje (p. ej. 21 para 21%). */
  readonly porcentaje: number;
  /** Etiqueta para UI/comprobante. */
  readonly etiqueta: string;
}

export const ALICUOTAS_IVA = {
  CERO: { codigoArca: 3, porcentaje: 0, etiqueta: "0%" },
  DOS_CON_CINCO: { codigoArca: 9, porcentaje: 2.5, etiqueta: "2,5%" },
  CINCO: { codigoArca: 8, porcentaje: 5, etiqueta: "5%" },
  DIEZ_CON_CINCO: { codigoArca: 4, porcentaje: 10.5, etiqueta: "10,5%" },
  VEINTIUNO: { codigoArca: 5, porcentaje: 21, etiqueta: "21%" },
  VEINTISIETE: { codigoArca: 6, porcentaje: 27, etiqueta: "27%" },
} as const satisfies Record<string, AlicuotaIva>;

/** Todas las alícuotas, para selects y validaciones. */
export const TODAS_LAS_ALICUOTAS: readonly AlicuotaIva[] = Object.values(ALICUOTAS_IVA);

/** Alícuota general (la más usada en el comercio minorista). */
export const ALICUOTA_GENERAL: AlicuotaIva = ALICUOTAS_IVA.VEINTIUNO;

/** Busca una alícuota por su porcentaje; `undefined` si no es una tasa válida. */
export function alicuotaPorPorcentaje(porcentaje: number): AlicuotaIva | undefined {
  return TODAS_LAS_ALICUOTAS.find((a) => a.porcentaje === porcentaje);
}

/** Busca una alícuota por su código ARCA; `undefined` si no existe. */
export function alicuotaPorCodigoArca(codigoArca: number): AlicuotaIva | undefined {
  return TODAS_LAS_ALICUOTAS.find((a) => a.codigoArca === codigoArca);
}
