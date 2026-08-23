/**
 * Firma de licencias con Ed25519 (ADR-0056).
 *
 * El formato lo fijan los tests de `apps/cloud-api/src/licencia/verificar-firma.spec.ts`,
 * que verifican con criptografía real. Es:
 *
 * ```
 * base64url(JSON de la licencia) . base64url(firma sobre los bytes de ese JSON)
 * ```
 *
 * Cualquier cambio acá rompe a TODOS los comercios instalados: el `cloud-api`
 * rechaza lo que no verifique, y una licencia rechazada se trata como "no
 * hay licencia" (que deja operar, pero también deja de poder bloquear).
 */

/**
 * base64 estándar → bytes.
 *
 * Limpia espacios y saltos de línea: esta clave se carga pegándola a mano en
 * `wrangler secret put`, y un salto invisible al final hacía fallar la firma
 * con un `InvalidCharacterError` que no decía nada útil.
 */
function desdeBase64(base64: string): Uint8Array {
  const limpio = (base64 ?? "").replace(/\s+/g, "");
  if (limpio === "") throw new Error("LICENCIAS_CLAVE_PRIVADA vacía o sin configurar");
  const binario = atob(limpio);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

/** bytes → base64url (sin relleno), que es lo que espera el verificador. */
function aBase64Url(bytes: Uint8Array): string {
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Importa la clave privada (PKCS#8 en base64, como la guarda
 * `~/.nexosoft/licencias-clave-privada.txt`).
 */
async function importarClave(privadaBase64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8",
    desdeBase64(privadaBase64) as unknown as BufferSource,
    { name: "Ed25519" },
    false,
    ["sign"],
  );
}

/** Arma el token firmado de una licencia. */
export async function firmarLicencia(licencia: unknown, privadaBase64: string): Promise<string> {
  const payload = new TextEncoder().encode(JSON.stringify(licencia));
  const clave = await importarClave(privadaBase64);
  const firma = new Uint8Array(
    await crypto.subtle.sign("Ed25519", clave, payload as unknown as BufferSource),
  );
  return `${aBase64Url(payload)}.${aBase64Url(firma)}`;
}
