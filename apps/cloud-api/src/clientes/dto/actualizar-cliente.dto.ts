import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumberString,
  IsEmail,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { CondicionIva } from '@prisma/client';

export class ActualizarClienteDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  nombre?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  documento?: string;

  @IsEnum(CondicionIva)
  @IsOptional()
  condicionIva?: CondicionIva;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  telefono?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  direccion?: string;

  @IsNumberString()
  @IsOptional()
  limiteCredito?: string;

  @IsBoolean()
  @IsOptional()
  activo?: boolean;
}
