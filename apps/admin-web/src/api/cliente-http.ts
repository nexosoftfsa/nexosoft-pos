/**
 * Cliente HTTP del panel. Adjunta el token Bearer, arma el query string y
 * normaliza los errores. Es genérico (GET tipado); los reportes concretos se
 * construyen encima en sub-fases siguientes.
 */

/** Error de API distinguible: lleva el status para diferenciar 401/403 del resto. */
export class ErrorApi extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ErrorApi";
  }
}

export type ParametrosQuery = Record<
  string,
  string | number | boolean | undefined
>;

export class ClienteApi {
  constructor(
    private readonly baseUrl: string,
    /** Devuelve el access token vigente, o null si no hay sesión. */
    private readonly obtenerToken: () => string | null,
  ) {}

  async get<T>(ruta: string, query?: ParametrosQuery): Promise<T> {
    const url = `${this.baseUrl}${ruta}${this.armarQuery(query)}`;
    const token = this.obtenerToken();

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!res.ok) {
      throw new ErrorApi(this.mensajeDeError(res.status), res.status);
    }
    return (await res.json()) as T;
  }

  private armarQuery(query?: ParametrosQuery): string {
    if (!query) return "";
    const params = new URLSearchParams();
    for (const [clave, valor] of Object.entries(query)) {
      if (valor !== undefined) params.append(clave, String(valor));
    }
    const s = params.toString();
    return s ? `?${s}` : "";
  }

  private mensajeDeError(status: number): string {
    if (status === 401) return "Sesión expirada o inválida";
    if (status === 403) return "No tenés permisos para ver reportes";
    return `Error del servidor (${status})`;
  }
}
