/**
 * Unidad de medida de un artículo. Define si admite cantidades fraccionadas.
 *  - `unidad`: se vende de a enteros (una gaseosa, un alfajor).
 *  - `fraccionado`: se vende en fracciones contadas (medio kilo envasado, metros).
 *  - `peso`: se pesa en balanza (fiambre, verdura) — siempre fraccionable.
 */
export const UnidadDeMedida = {
  Unidad: "unidad",
  Fraccionado: "fraccionado",
  Peso: "peso",
} as const;

export type UnidadDeMedida = (typeof UnidadDeMedida)[keyof typeof UnidadDeMedida];

export const UNIDADES_DE_MEDIDA: readonly UnidadDeMedida[] = Object.values(UnidadDeMedida);

/** ¿La unidad admite cantidades con decimales (1,250)? */
export function permiteCantidadFraccionada(unidad: UnidadDeMedida): boolean {
  return unidad !== UnidadDeMedida.Unidad;
}

export function etiquetaUnidad(unidad: UnidadDeMedida): string {
  switch (unidad) {
    case UnidadDeMedida.Unidad:
      return "Unidad";
    case UnidadDeMedida.Fraccionado:
      return "Fraccionado";
    case UnidadDeMedida.Peso:
      return "Por peso";
  }
}
