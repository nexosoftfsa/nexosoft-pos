import { IsNumberString, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Emitir una Nota de Débito sobre un comprobante ya emitido.
 *
 * A diferencia de la Nota de Crédito —que anula y sale por el total del
 * original— la de Débito **suma**: intereses por mora, gastos de envío que se
 * facturan después, un ajuste de precio hacia arriba. Por eso lleva su propio
 * monto y su propio concepto, y el original **no** se anula ni se toca.
 */
export class EmitirNotaDebitoDto {
  /** Importe de la nota, con IVA incluido igual que los precios del comercio. */
  @IsNumberString()
  monto!: string;

  /**
   * Por qué se debita. Va impreso en el comprobante como descripción de la
   * única línea, así que tiene que ser algo que el cliente entienda: "Intereses
   * por pago fuera de término", "Diferencia de flete".
   */
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  concepto!: string;
}
