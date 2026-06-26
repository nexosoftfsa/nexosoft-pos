import { IsString, IsOptional, IsEnum, IsNumberString, IsBoolean, MaxLength } from 'class-validator';
import { TipoIva } from '@prisma/client';

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

  @IsString()
  @IsOptional()
  categoriaId?: string;
}
