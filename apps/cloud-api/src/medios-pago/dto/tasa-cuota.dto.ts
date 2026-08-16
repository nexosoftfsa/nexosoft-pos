import { IsInt, IsNumber, Min } from 'class-validator';

export class TasaCuotaDto {
  @IsInt()
  @Min(1)
  cantidadCuotas!: number;

  /** Porcentaje de recargo para esa cantidad de cuotas (0..100). */
  @IsNumber()
  @Min(0)
  recargoPorcentaje!: number;
}
