/**
 * Cliente HTTP de autenticación contra el cloud-api (`POST /auth/login`,
 * `POST /auth/refresh`). Devuelve el par de tokens (access 15m + refresh 30d).
 */
export interface Credenciales {
  readonly email: string;
  readonly password: string;
}

export interface TokensAuth {
  readonly accessToken: string;
  readonly refreshToken: string;
}

/** Puerto: lo que el `SesionManager` necesita del servidor (testeable con un doble). */
export interface ClienteAuth {
  login(credenciales: Credenciales): Promise<TokensAuth>;
  refresh(refreshToken: string): Promise<TokensAuth>;
}

/** Error de autenticación distinguible (credenciales / refresh inválidos: 401). */
export class ErrorAuth extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ErrorAuth";
  }
}

export class ClienteAuthHttp implements ClienteAuth {
  constructor(private readonly baseUrl: string) {}

  async login(credenciales: Credenciales): Promise<TokensAuth> {
    return this.post("/auth/login", credenciales);
  }

  async refresh(refreshToken: string): Promise<TokensAuth> {
    return this.post("/auth/refresh", { refreshToken });
  }

  private async post(ruta: string, cuerpo: unknown): Promise<TokensAuth> {
    const res = await fetch(`${this.baseUrl}${ruta}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    if (!res.ok) {
      const detalle = res.status === 401 ? "Credenciales inválidas" : `Error ${res.status}`;
      throw new ErrorAuth(detalle, res.status);
    }
    return (await res.json()) as TokensAuth;
  }
}
