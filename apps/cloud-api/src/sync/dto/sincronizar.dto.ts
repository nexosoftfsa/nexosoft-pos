import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsObject,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OperacionEntranteDto {
  /** UUID generado en el POS; idempotencia. */
  @IsString()
  @IsNotEmpty()
  operacionId!: string;

  /** Tipo de operación (por ahora "venta"). */
  @IsString()
  @IsNotEmpty()
  tipo!: string;

  /** Cuerpo de la operación (para "venta": el CrearVentaDto). */
  @IsObject()
  payload!: Record<string, unknown>;

  /** Caja que originó la operación. */
  @IsString()
  @IsOptional()
  terminalId?: string;
}

export class SincronizarDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OperacionEntranteDto)
  operaciones!: OperacionEntranteDto[];
}
