import { IsString, IsOptional, IsEmail, IsBoolean, MaxLength } from 'class-validator';

export class ActualizarProveedorDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  nombre?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  cuit?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  contacto?: string;

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

  @IsBoolean()
  @IsOptional()
  activo?: boolean;
}
