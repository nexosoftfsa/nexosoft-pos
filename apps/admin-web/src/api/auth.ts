import { ErrorApi } from "./cliente-http";

export interface Credenciales {
  readonly email: string;
  readonly password: string;
}

export interface TokensAuth {
  readonly accessToken: string;
  readonly refreshToken: string;
}

/**
 * Login contra el cloud-api. Devuelve el par de tokens (el backend NO devuelve
 * datos del usuario; el rol/email se leen decodificando el access token — ver
 * `auth/token.ts`).
 */
export async function iniciarSesion(
  baseUrl: string,
  credenciales: Credenciales,
): Promise<TokensAuth> {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(credenciales),
  });

  if (!res.ok) {
    const detalle =
      res.status === 401 ? "Email o contraseña incorrectos" : `Error ${res.status}`;
    throw new ErrorApi(detalle, res.status);
  }
  return (await res.json()) as TokensAuth;
}
