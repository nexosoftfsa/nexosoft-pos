/**
 * Configuración del Asistente IA desde la UI (ADR-0040): cargar/editar la clave
 * de Gemini sin tocar archivos del servidor. Solo ADMIN (el backend lo exige
 * igual con `RolesGuard`). La clave nunca vuelve del servidor: `obtener()` solo
 * informa si hay una cargada y con qué modelo.
 */
export interface EstadoConfiguracionAsistente {
  readonly configurada: boolean;
  readonly modelo: string;
}

export interface ClienteAsistenteConfig {
  obtener(): Promise<EstadoConfiguracionAsistente>;
  actualizar(apiKey: string, modelo?: string): Promise<EstadoConfiguracionAsistente>;
}

export class ErrorAsistenteConfig extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ErrorAsistenteConfig";
  }
}

export class ClienteAsistenteConfigHttp implements ClienteAsistenteConfig {
  constructor(
    private readonly baseUrl: string,
    private readonly obtenerToken: () => string | null,
  ) {}

  obtener(): Promise<EstadoConfiguracionAsistente> {
    return this.pedir<EstadoConfiguracionAsistente>("GET", "/asistente/configuracion");
  }

  actualizar(apiKey: string, modelo?: string): Promise<EstadoConfiguracionAsistente> {
    return this.pedir<EstadoConfiguracionAsistente>("PUT", "/asistente/configuracion", {
      apiKey,
      ...(modelo !== undefined && modelo.trim() !== "" ? { modelo: modelo.trim() } : {}),
    });
  }

  private async pedir<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
    const token = this.obtenerToken();
    const res = await fetch(`${this.baseUrl}${ruta}`, {
      method: metodo,
      headers: {
        "Content-Type": "application/json",
        ...(token !== null ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}),
    });
    if (!res.ok) {
      const cuerpoError = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
      const m = cuerpoError?.message;
      const mensaje = Array.isArray(m) ? m.join(". ") : (m ?? `Error ${res.status} del servidor`);
      throw new ErrorAsistenteConfig(mensaje, res.status);
    }
    return (await res.json()) as T;
  }
}
