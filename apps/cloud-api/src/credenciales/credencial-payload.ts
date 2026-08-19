import { randomBytes } from 'node:crypto';

/**
 * Prefijo del payload codificado en el código de barras de la credencial
 * física (Fase 15.A, ver ADR-0051). Permite descartar barato cualquier código
 * escaneado que no sea una credencial (ej. si por error se escanea un
 * producto en la pantalla de login).
 */
const PREFIJO = 'NXSCRED';

export interface PayloadCredencial {
  readonly usuarioId: string;
  readonly tokenPlano: string;
}

/** Genera un token aleatorio de alta entropía (~144 bits) para una credencial nueva. */
export function generarTokenPlano(): string {
  return randomBytes(24).toString('base64url');
}

/**
 * Arma el texto que se codifica en el código de barras (Code128).
 * `usuarioId` va en claro para poder buscar la credencial en O(1) sin
 * comparar contra todos los hashes activos (argon2.verify es deliberadamente
 * lento).
 */
export function armarPayload(usuarioId: string, tokenPlano: string): string {
  return `${PREFIJO}:${usuarioId}:${tokenPlano}`;
}

/** Parsea un código escaneado. Devuelve `null` si no tiene el formato esperado. */
export function parsearPayload(codigo: string): PayloadCredencial | null {
  const partes = codigo.split(':');
  if (partes.length !== 3) return null;

  const [prefijo, usuarioId, tokenPlano] = partes;
  if (
    prefijo !== PREFIJO ||
    usuarioId === undefined ||
    tokenPlano === undefined ||
    usuarioId.length === 0 ||
    tokenPlano.length === 0
  ) {
    return null;
  }

  return { usuarioId, tokenPlano };
}
