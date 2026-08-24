import { IsOptional, IsString, MinLength } from 'class-validator';

/** Mismo mínimo que el alta (`RegistroDto`): no se endurece por la ventana. */
export const LARGO_MINIMO_PASSWORD = 8;

export class CambiarPasswordDto {
  @IsString()
  @MinLength(LARGO_MINIMO_PASSWORD, {
    message: `La contraseña debe tener al menos ${LARGO_MINIMO_PASSWORD} caracteres.`,
  })
  passwordNueva!: string;

  /**
   * Obligatoria SOLO cuando alguien cambia su propia contraseña. Sin esto,
   * cualquiera que encuentre una sesión de ADMIN abierta podría cambiarle la
   * clave al dueño y dejarlo afuera de su propio sistema. Un ADMIN que le
   * cambia la contraseña a otro usuario no la necesita: es justamente el caso
   * de "el cajero se la olvidó".
   */
  @IsString()
  @IsOptional()
  passwordActual?: string;
}
