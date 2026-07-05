import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumberString,
  IsArray,
  IsBoolean,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TipoIva, TipoProducto } from '@prisma/client';
import { ComboComponenteDto } from './combo-componente.dto';

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

  @IsEnum(TipoProducto)
  @IsOptional()
  tipo?: TipoProducto;

  /** Producto perecedero: se gestiona por lotes con vencimiento (Fase 8.2). */
  @IsBoolean()
  @IsOptional()
  requiereLote?: boolean;

  /** Componentes del combo (obligatorio cuando `tipo` es COMBO). */
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ComboComponenteDto)
  componentes?: ComboComponenteDto[];

  @IsString()
  @IsOptional()
  categoriaId?: string;
}
