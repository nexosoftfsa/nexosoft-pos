import { IsString, IsNotEmpty, IsOptional, MinLength, MaxLength } from 'class-validator';

export class ActualizarConfiguracionDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(200)
  apiKey!: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  modelo?: string;
}
