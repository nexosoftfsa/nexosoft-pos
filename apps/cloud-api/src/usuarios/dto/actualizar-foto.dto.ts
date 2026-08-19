import { IsString, MaxLength } from 'class-validator';

export class ActualizarFotoDto {
  /** Data URL de la foto de perfil (ej. `data:image/jpeg;base64,...`). String vacío = borrar. */
  @IsString()
  @MaxLength(400_000)
  fotoBase64!: string;
}
