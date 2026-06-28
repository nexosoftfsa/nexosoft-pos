import type { TokensAuth } from "../api/auth";

/**
 * Persistencia de los tokens en `localStorage` para sobrevivir recargas.
 * (El panel es read-only y corre en la LAN; no se guarda nada sensible más allá
 * del propio JWT, que de todos modos expira.)
 */
const CLAVE = "nexosoft.admin.tokens";

export function guardarTokens(tokens: TokensAuth): void {
  localStorage.setItem(CLAVE, JSON.stringify(tokens));
}

export function leerTokens(): TokensAuth | null {
  const raw = localStorage.getItem(CLAVE);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TokensAuth;
  } catch {
    return null;
  }
}

export function borrarTokens(): void {
  localStorage.removeItem(CLAVE);
}
