import { z } from 'zod';

/**
 * Contrato del archivo de estado que escribe
 * `scripts/instalacion/instalar-acceso-remoto.ps1` (Fase 17.A, ADR-0055).
 *
 * El script corre elevado y es el único que conoce el token del túnel; acá
 * solo se lee lo que se puede mostrar. El token vive en OTRO archivo
 * (`acceso-remoto-config.json`, con ACL cerrada) justamente para que no
 * pueda salir por esta API ni por accidente.
 */
export const ARCHIVO_ESTADO_SCHEMA = z.object({
  estado: z.enum(['activo', 'apagado']),
  url: z.string().url().nullable().optional(),
  mensaje: z.string().nullable().optional(),
  alcanzable: z.boolean().nullable().optional(),
  actualizadoEn: z.string().nullable().optional(),
});

/** Estados que ve el POS. `no-configurado` = nunca se dio de alta en esta PC. */
export type EstadoAccesoRemoto = 'activo' | 'apagado' | 'no-configurado';

export interface AccesoRemoto {
  readonly estado: EstadoAccesoRemoto;
  /** Dirección pública fija del comercio, p. ej. `https://lagus.nexosoft.com.ar`. */
  readonly url: string | null;
  /**
   * Si el panel responde ahora mismo desde afuera (ida y vuelta real por
   * Cloudflare). `null` mientras no se haya podido comprobar.
   */
  readonly alcanzable: boolean | null;
  readonly mensaje: string | null;
  readonly actualizadoEn: string | null;
}

/** Lo que se responde cuando el acceso remoto nunca se configuró en esta PC. */
export const NO_CONFIGURADO: AccesoRemoto = {
  estado: 'no-configurado',
  url: null,
  alcanzable: null,
  mensaje: null,
  actualizadoEn: null,
};

/** BOM (U+FEFF). PowerShell lo agrega solo si alguien escribe el archivo sin cuidado. */
const BOM = /^\uFEFF/;

/**
 * Interpreta el contenido del archivo de estado. Devuelve `null` si el texto
 * no es un estado válido — un archivo corrupto o a medio escribir no tiene
 * que romper la pantalla de configuración del POS.
 */
export function parsearEstadoAccesoRemoto(texto: string): AccesoRemoto | null {
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto.replace(BOM, ''));
  } catch {
    return null;
  }
  const resultado = ARCHIVO_ESTADO_SCHEMA.safeParse(crudo);
  if (!resultado.success) return null;
  const { estado, url, mensaje, alcanzable, actualizadoEn } = resultado.data;
  return {
    estado,
    url: url ?? null,
    alcanzable: alcanzable ?? null,
    mensaje: mensaje ?? null,
    actualizadoEn: actualizadoEn ?? null,
  };
}
