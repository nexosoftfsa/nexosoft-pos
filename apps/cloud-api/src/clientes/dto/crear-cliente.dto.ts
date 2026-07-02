import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumberString,
  IsEmail,
  MaxLength,
} from 'class-validator';
import { CondicionIva } from '@prisma/client';

export class CrearClienteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nombre!: string;

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

  /** Límite de crédito. 0 = sin límite. */
  @IsNumberString()
  @IsOptional()
  limiteCredito?: string;
}
