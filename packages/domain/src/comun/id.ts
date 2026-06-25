/**
 * Generación de identificadores de entidades de dominio.
 *
 * Usa `crypto.randomUUID()` cuando está disponible (Node ≥ 18 y webview de Tauri).
 * El fallback no es criptográfico, pero alcanza para identificar entidades
 * locales antes de sincronizar. El backend puede reasignar/validar IDs.
 */
type ConCrypto = { crypto?: { randomUUID?: () => string } };

export function nuevoId(): string {
  const c = (globalThis as ConCrypto).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
