import { IsString, IsNotEmpty, IsNumberString } from 'class-validator';

export class AbrirTurnoDto {
  @IsString()
  @IsNotEmpty()
  terminalId!: string;

  /** Efectivo con el que se abre la caja (fondo inicial). */
  @IsNumberString()
  fondoApertura!: string;
}
