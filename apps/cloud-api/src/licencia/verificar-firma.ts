import { createPublicKey, verify } from 'node:crypto';
import { z } from 'zod';
import { EstadoSuscripcion, type Licencia } from '@nexosoft/licencias';

/**
 * Verificación de la licencia firmada (Fase 17.B, ADR-0056).
 *
 * Vive en `cloud-api` y no en `@nexosoft/licencias` porque usa `node:crypto`,
 * y ese paquete también lo consume el POS, que corre en un navegador. El POS
 * nunca verifica firmas: le pregunta a su servidor.
 *
 * **Formato del token** (lo tiene que respetar el Worker que las emite):
 *
 * ```
 * <payload>.<firma>
 * ```
 *
 * - `payload`: el JSON de la licencia, en base64url.
 * - `firma`: Ed25519 sobre los **bytes del JSON ya decodificado**, en base64url.
 *
 * La clave pública no es un secreto: viaja en `LICENCIAS_CLAVE_PUBLICA` como
 * la DER SPKI en base64. La privada existe únicamente como secret del Worker.
 */

const LICENCIA_SCHEMA = z.object({
  comercioId: z.string().min(1),
  estado: z.nativeEnum(EstadoSuscripcion),
  vencePagoEl: z.string().min(8),
  validaHasta: z.string().min(8),
  mensaje: z.string().nullable().optional(),
  emitidaEn: z.string().min(8),
});

/**
 * Devuelve la licencia si el token es auténtico, o `null` si no lo es.
 *
 * **Nunca lanza.** Un token corrupto, vencido en su formato, firmado con otra
 * clave o directamente inventado se trata igual que no tener licencia — y no
 * tener licencia deja operar (ADR-0056 §3). Un atacante no gana nada
 * mandando basura: lo único que no puede es fabricar un `BLOQUEADA` ajeno,
 * ni levantar un bloqueo real.
 */
export function verificarToken(token: string, clavePublicaBase64: string): Licencia | null {
  const partes = token.trim().split('.');
  if (partes.length !== 2) return null;
  const [payloadB64, firmaB64] = partes;
  if (payloadB64 === undefined || firmaB64 === undefined) return null;

  let payload: Buffer;
  let firma: Buffer;
  let clave;
  try {
    payload = Buffer.from(payloadB64, 'base64url');
    firma = Buffer.from(firmaB64, 'base64url');
    clave = createPublicKey({
      key: Buffer.from(clavePublicaBase64, 'base64'),
      format: 'der',
      type: 'spki',
    });
  } catch {
    return null;
  }

  // Ed25519: el algoritmo va en null, lo define la propia clave.
  let firmaOk: boolean;
  try {
    firmaOk = verify(null, payload, clave, firma);
  } catch {
    return null;
  }
  if (!firmaOk) return null;

  try {
    const datos: unknown = JSON.parse(payload.toString('utf8'));
    const r = LICENCIA_SCHEMA.safeParse(datos);
    if (!r.success) return null;
    const { mensaje, ...resto } = r.data;
    return { ...resto, mensaje: mensaje ?? null };
  } catch {
    return null;
  }
}
