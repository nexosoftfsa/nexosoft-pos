import { IsNumberString, IsString, IsOptional, MaxLength } from 'class-validator';

export class CerrarTurnoDto {
  /** Efectivo contado físicamente en el arqueo. */
  @IsNumberString()
  montoContado!: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  observaciones?: string;
}
