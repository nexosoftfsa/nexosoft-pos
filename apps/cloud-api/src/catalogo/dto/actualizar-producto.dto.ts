import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumberString,
  IsBoolean,
  IsArray,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TipoIva } from '@prisma/client';
import { ComboComponenteDto } from './combo-componente.dto';

export class ActualizarProductoDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  nombre?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  descripcion?: string;

  @IsNumberString()
  @IsOptional()
  precioVenta?: string;

  @IsNumberString()
  @IsOptional()
  precioCosto?: string;

  @IsEnum(TipoIva)
  @IsOptional()
  tipoIva?: TipoIva;

  @IsBoolean()
  @IsOptional()
  activo?: boolean;

  /** Reemplaza el set de componentes del combo (solo aplica a productos COMBO). */
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ComboComponenteDto)
  componentes?: ComboComponenteDto[];

  @IsString()
  @IsOptional()
  categoriaId?: string;
}
