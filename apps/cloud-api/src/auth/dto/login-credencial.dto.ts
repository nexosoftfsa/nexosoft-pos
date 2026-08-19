import { IsString, MinLength, MaxLength } from 'class-validator';

export class LoginCredencialDto {
  /** Payload crudo escaneado del código de barras, ej. "NXSCRED:{usuarioId}:{token}". */
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  credencial!: string;
}
