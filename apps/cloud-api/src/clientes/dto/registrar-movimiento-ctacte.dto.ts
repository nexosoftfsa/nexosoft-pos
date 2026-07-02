import { IsNumberString, IsString, IsOptional, MaxLength } from 'class-validator';

/** Cargo (venta a cuenta) o pago (cobro). El tipo lo define el endpoint. */
export class RegistrarMovimientoCtaCteDto {
  @IsNumberString()
  monto!: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  concepto?: string;
}
