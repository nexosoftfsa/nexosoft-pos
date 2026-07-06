import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class PreguntarDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  pregunta!: string;
}
