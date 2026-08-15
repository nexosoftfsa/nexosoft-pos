import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { RolUsuario } from '@prisma/client';

export class ActualizarUsuarioDto {
  @IsEnum(RolUsuario)
  @IsOptional()
  rol?: RolUsuario;

  @IsBoolean()
  @IsOptional()
  activo?: boolean;
}
