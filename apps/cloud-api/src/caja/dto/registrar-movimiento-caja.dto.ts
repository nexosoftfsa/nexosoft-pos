import { IsEnum, IsNumberString, IsString, IsOptional, MaxLength } from 'class-validator';
import { TipoMovimientoCaja } from '@prisma/client';

export class RegistrarMovimientoCajaDto {
  @IsEnum(TipoMovimientoCaja)
  tipo!: TipoMovimientoCaja;

  @IsNumberString()
  monto!: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  concepto?: string;
}
