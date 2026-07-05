import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsNumberString,
  IsDateString,
} from 'class-validator';
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

  /** ENTRADA de un producto con lote: fecha de vencimiento (ISO). */
  @IsDateString()
  @IsOptional()
  fechaVencimiento?: string;

  /** ENTRADA de un producto con lote: número de lote del proveedor (opcional). */
  @IsString()
  @IsOptional()
  numeroLote?: string;
}
