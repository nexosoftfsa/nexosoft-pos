import { IsString, IsOptional, IsEnum, IsBoolean, IsArray, ValidateNested, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { TipoTarjeta } from '@prisma/client';
import { TasaCuotaDto } from './tasa-cuota.dto';

export class ActualizarTarjetaDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  banco?: string;

  @IsEnum(TipoTarjeta)
  @IsOptional()
  tipo?: TipoTarjeta;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  marca?: string;

  @IsBoolean()
  @IsOptional()
  activo?: boolean;

  /** Si viene, reemplaza el set completo de tasas por cuotas. */
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => TasaCuotaDto)
  tasas?: TasaCuotaDto[];
}
