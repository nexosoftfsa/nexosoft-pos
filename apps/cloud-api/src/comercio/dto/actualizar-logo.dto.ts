import { IsString, MaxLength } from 'class-validator';

export class ActualizarLogoDto {
  /** Data URL del logo (ej. `data:image/png;base64,...`). String vacío = borrar. */
  @IsString()
  @MaxLength(500_000)
  logoBase64!: string;
}
