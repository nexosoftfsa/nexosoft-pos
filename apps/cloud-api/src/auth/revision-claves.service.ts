import { Injectable } from '@nestjs/common';
import { evaluarFortaleza, type ContextoPassword } from './fortaleza-password';

export interface ClaveDebil {
  readonly usuarioId: string;
  readonly email: string;
  readonly rol: string;
  readonly motivo: string;
  readonly revisadaEn: string;
}

/**
 * Registro de qué usuarios tienen una contraseña débil para exponerla a
 * internet (Fase 17.C). Lo alimenta el login: es el único momento en que el
 * servidor ve la contraseña en claro — de la base sólo sale el hash de
 * argon2, que por diseño no se puede evaluar.
 *
 * **Nunca guarda la contraseña**, sólo el veredicto y el motivo.
 *
 * Vive en memoria, igual que `LoginLockoutService` (ADR-0052) y por la misma
 * razón: `cloud-api` corre como un único servidor de sucursal (ADR-0019). Se
 * vacía al reiniciar el servidor, así que después de un reinicio un usuario
 * aparece como "sin revisar" hasta que vuelva a entrar. Es aceptable para lo
 * que hace — avisar antes de publicar el panel —, y evita agregarle una
 * columna a `Usuario` para un dato que se recalcula solo.
 */
@Injectable()
export class RevisionClavesService {
  private readonly debiles = new Map<string, ClaveDebil>();

  /** Se llama en cada login exitoso, con la contraseña en claro. */
  revisar(
    usuario: { id: string; email: string; rol: string },
    password: string,
    contexto: ContextoPassword = {},
  ): void {
    const { debil, motivo } = evaluarFortaleza(password, contexto);
    if (!debil || motivo === null) {
      // La cambió por una buena: deja de figurar.
      this.debiles.delete(usuario.id);
      return;
    }
    this.debiles.set(usuario.id, {
      usuarioId: usuario.id,
      email: usuario.email,
      rol: usuario.rol,
      motivo,
      revisadaEn: new Date().toISOString(),
    });
  }

  /** Todas las débiles conocidas, de más vieja a más nueva. */
  listar(): ClaveDebil[] {
    return [...this.debiles.values()].sort((a, b) => a.revisadaEn.localeCompare(b.revisadaEn));
  }

  /** La de un usuario puntual, o `null` si no se sabe o es fuerte. */
  deUsuario(usuarioId: string): ClaveDebil | null {
    return this.debiles.get(usuarioId) ?? null;
  }

  /** Para cuando un usuario cambia su contraseña por otra vía. */
  olvidar(usuarioId: string): void {
    this.debiles.delete(usuarioId);
  }
}
