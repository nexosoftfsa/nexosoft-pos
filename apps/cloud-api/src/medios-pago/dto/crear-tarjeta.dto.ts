import { IsString, IsNotEmpty, IsOptional, IsEnum, IsArray, ValidateNested, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { TipoTarjeta } from '@prisma/client';
import { TasaCuotaDto } from './tasa-cuota.dto';

export class CrearTarjetaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  banco!: string;

  @IsEnum(TipoTarjeta)
  tipo!: TipoTarjeta;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  marca?: string;

  /** Tasas de recargo según cantidad de cuotas. */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TasaCuotaDto)
  tasas!: TasaCuotaDto[];
}
