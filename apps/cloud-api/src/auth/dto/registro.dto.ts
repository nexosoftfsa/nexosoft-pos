import { IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { RolUsuario } from '@prisma/client';

export class RegistroDto {
  // Nombre de usuario para loguearse. Se guarda en la columna `email` (nunca
  // se envía nada a esta casilla: no hay verificación ni recupero de clave
  // por correo), pero no exige formato de email — cualquier texto sirve.
  @IsString()
  @MinLength(3)
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
