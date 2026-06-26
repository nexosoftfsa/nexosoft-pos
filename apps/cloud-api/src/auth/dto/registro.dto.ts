import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { RolUsuario } from '@prisma/client';

export class RegistroDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  nombreDisplay!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsEnum(RolUsuario)
  @IsOptional()
  rol?: RolUsuario;

  @IsString()
  @IsNotEmpty()
  sucursalId!: string;
}
