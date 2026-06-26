import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumberString,
  MaxLength,
} from 'class-validator';
import { TipoIva } from '@prisma/client';

export class CrearProductoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  codigo!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nombre!: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  descripcion?: string;

  @IsNumberString()
  precioVenta!: string;

  @IsNumberString()
  precioCosto!: string;

  @IsEnum(TipoIva)
  @IsOptional()
  tipoIva?: TipoIva;

  @IsString()
  @IsOptional()
  categoriaId?: string;
}
