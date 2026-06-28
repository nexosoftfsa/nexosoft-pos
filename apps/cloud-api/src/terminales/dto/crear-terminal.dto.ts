import { IsString, IsNotEmpty } from 'class-validator';

export class CrearTerminalDto {
  @IsString()
  @IsNotEmpty()
  nombre!: string;
}
