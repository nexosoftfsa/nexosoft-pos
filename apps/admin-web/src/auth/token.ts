/**
 * Lectura del access token JWT en el cliente. El cloud-api no expone los datos
 * del usuario en el login, pero el payload del JWT los trae
 * (`{ sub, email, rol, sucursalId, exp }`). Decodificarlo evita un endpoint
 * extra; la autorización real la sigue imponiendo el backend (RolesGuard).
 */

export interface DatosSesion {
  readonly usuarioId: string;
  readonly email: string;
  readonly rol: string;
  readonly sucursalId: string;
  /** Expiración (epoch en segundos) tal como viene en el claim `exp`. */
  readonly expEnSegundos: number;
}

interface PayloadJwt {
  sub: string;
  email: string;
  rol: string;
  sucursalId: string;
  exp: number;
}

/** Decodifica base64url (sin padding) a string UTF-8. */
function decodificarBase64Url(segmento: string): string {
  const base64 = segmento.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return atob(padded);
}

/** Extrae los datos de sesión del access token. Lanza si el token es inválido. */
export function decodificarToken(accessToken: string): DatosSesion {
  const partes = accessToken.split(".");
  if (partes.length !== 3 || !partes[1]) {
    throw new Error("Token JWT con formato inválido");
  }

  let payload: PayloadJwt;
  try {
    payload = JSON.parse(decodificarBase64Url(partes[1])) as PayloadJwt;
  } catch {
    throw new Error("No se pudo leer el payload del token");
  }

  if (!payload.sub || !payload.rol || !payload.sucursalId) {
    throw new Error("El token no tiene los datos esperados");
  }

  return {
    usuarioId: payload.sub,
    email: payload.email,
    rol: payload.rol,
    sucursalId: payload.sucursalId,
    expEnSegundos: payload.exp,
  };
}

/** Roles autorizados a ver el panel de reportes. Refleja el RBAC del backend. */
export const ROLES_CON_ACCESO = ["ADMIN", "SUPERVISOR"] as const;

export function tieneAccesoAReportes(rol: string): boolean {
  return (ROLES_CON_ACCESO as readonly string[]).includes(rol);
}

/** True si el token ya expiró (con un margen de 10s para evitar carreras). */
export function tokenExpirado(datos: DatosSesion, ahoraMs: number = Date.now()): boolean {
  const margenSegundos = 10;
  return datos.expEnSegundos - margenSegundos <= Math.floor(ahoraMs / 1000);
}
