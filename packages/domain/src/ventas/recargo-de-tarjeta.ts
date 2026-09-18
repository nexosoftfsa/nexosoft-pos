/**
 * Qué recargo puede llevar una tarjeta, según su tipo.
 *
 * **El débito no puede llevar ninguno.** La Ley 27.253 obliga a los comercios a
 * aceptar tarjeta de débito y a hacerlo *"sin aplicar recargo alguno"*. No es
 * una recomendación ni una práctica comercial: cobrar de más por pagar con
 * débito está multado por Defensa del Consumidor.
 *
 * La regla vive acá, en el dominio, y no en el formulario: la usan el alta de
 * tarjetas del servidor, la validación de la pantalla y —sobre todo— el cobro
 * mismo. Ese último importa más de lo que parece. Un comercio que ya tenía una
 * tarjeta de débito configurada con recargo antes de esta regla la sigue
 * teniendo en su base, y si sólo se validara el alta, el POS le seguiría
 * cobrando de más al cliente hasta que alguien entre a editarla.
 *
 * Y el débito tampoco tiene cuotas: es un pago único contra el saldo de la
 * cuenta. Una tarjeta de débito "en 6 cuotas" no existe.
 */

/** Los dos tipos de tarjeta que se pueden configurar. */
export const TipoTarjeta = {
  Credito: "CREDITO",
  Debito: "DEBITO",
} as const;

export type TipoTarjeta = (typeof TipoTarjeta)[keyof typeof TipoTarjeta];

/** `true` si con esta tarjeta se puede cobrar un recargo. */
export function admiteRecargo(tipo: TipoTarjeta | string): boolean {
  return tipo !== TipoTarjeta.Debito;
}

/** `true` si con esta tarjeta se puede pagar en cuotas. */
export function admiteCuotas(tipo: TipoTarjeta | string): boolean {
  return tipo !== TipoTarjeta.Debito;
}

/**
 * El recargo que realmente corresponde aplicar, en porcentaje.
 *
 * Es la última red, la que se usa al cobrar: aunque la configuración guardada
 * traiga un recargo para una tarjeta de débito —porque se cargó antes de que
 * existiera esta regla, o porque alguien tocó la base— acá se ignora. El
 * cliente no paga de más por un dato viejo.
 */
export function recargoQueCorresponde(
  tipo: TipoTarjeta | string,
  recargoPorcentaje: number,
): number {
  if (!admiteRecargo(tipo)) return 0;
  return recargoPorcentaje > 0 ? recargoPorcentaje : 0;
}

/**
 * Por qué esta tasa no se puede guardar, o `null` si se puede.
 *
 * Devuelve el motivo en castellano y con la razón, no un código: lo lee el
 * dueño del comercio en la pantalla de Medios de pago, y "no se permite" sin
 * explicación invita a buscarle la vuelta.
 */
export function motivoTasaInvalida(
  tipo: TipoTarjeta | string,
  tasa: { readonly cantidadCuotas: number; readonly recargoPorcentaje: number },
): string | null {
  if (admiteRecargo(tipo)) return null;
  if (tasa.recargoPorcentaje > 0) {
    return (
      "Una tarjeta de débito no puede tener recargo: la Ley 27.253 obliga a " +
      "aceptarla sin recargo alguno. Dejá el recargo en 0."
    );
  }
  if (tasa.cantidadCuotas > 1) {
    return "Una tarjeta de débito no tiene cuotas: el pago es único. Dejá 1 cuota.";
  }
  return null;
}

/** Los motivos de todas las tasas de una tarjeta, sin repetir. */
export function motivosDeTasasInvalidas(
  tipo: TipoTarjeta | string,
  tasas: ReadonlyArray<{ readonly cantidadCuotas: number; readonly recargoPorcentaje: number }>,
): string[] {
  const motivos = new Set<string>();
  for (const tasa of tasas) {
    const motivo = motivoTasaInvalida(tipo, tasa);
    if (motivo !== null) motivos.add(motivo);
  }
  return [...motivos];
}
