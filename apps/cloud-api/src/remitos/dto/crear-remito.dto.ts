import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumberString,
  IsArray,
  ArrayMinSize,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ItemRemitoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  descripcion!: string;

  @IsNumberString()
  cantidad!: string;

  @IsString()
  @IsOptional()
  productoId?: string;
}

export class CrearRemitoDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  clienteNombre?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  observaciones?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ItemRemitoDto)
  items!: ItemRemitoDto[];
}
