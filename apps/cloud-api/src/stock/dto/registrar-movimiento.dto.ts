import { IsString, IsNotEmpty, IsEnum, IsOptional, IsNumberString } from 'class-validator';
import { TipoMovimiento } from '@prisma/client';

export class RegistrarMovimientoDto {
  @IsString()
  @IsNotEmpty()
  productoId!: string;

  @IsEnum(TipoMovimiento)
  tipo!: TipoMovimiento;

  @IsNumberString()
  cantidad!: string;

  @IsString()
  @IsOptional()
  motivo?: string;
}
