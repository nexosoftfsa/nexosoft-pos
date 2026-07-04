import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumberString,
  IsInt,
  Min,
  IsArray,
  ArrayMinSize,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ItemPresupuestoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  descripcion!: string;

  @IsNumberString()
  cantidad!: string;

  @IsNumberString()
  precioUnitario!: string;

  @IsString()
  @IsOptional()
  productoId?: string;
}

export class CrearPresupuestoDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  clienteNombre?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  observaciones?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  validezDias?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ItemPresupuestoDto)
  items!: ItemPresupuestoDto[];
}
