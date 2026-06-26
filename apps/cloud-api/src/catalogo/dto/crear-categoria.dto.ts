import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CrearCategoriaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre!: string;
}
