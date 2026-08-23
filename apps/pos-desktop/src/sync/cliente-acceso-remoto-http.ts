/**
 * Estado del acceso remoto del comercio (`GET /acceso-remoto`, Fase 17.A /
 * ADR-0055): la dirección pública fija que atiende el túnel de Cloudflare, y
 * si responde ahora mismo desde afuera.
 *
 * Solo lectura: el alta y la baja del túnel las hace un script elevado
 * (ver `datos/acceso-remoto.ts`), no esta API.
 */
import { esFalloDeRed, MENSAJE_SIN_CONEXION } from "./errores-red";

export interface EstadoAccesoRemoto {
  readonly estado: "activo" | "apagado" | "no-configurado";
  /** Dirección pública, p. ej. `https://lagus.nexosoft.com.ar`. */
  readonly url: string | null;
  readonly alcanzable: boolean | null;
  readonly mensaje: string | null;
  readonly actualizadoEn: string | null;
}

export class ClienteAccesoRemotoHttp {
  constructor(
    private readonly baseUrl: string,
    private readonly obtenerToken: () => string | null,
  ) {}

  async obtener(): Promise<EstadoAccesoRemoto> {
    const token = this.obtenerToken();
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/acceso-remoto`, {
        headers: token !== null ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch (e) {
      throw new Error(esFalloDeRed(e) ? MENSAJE_SIN_CONEXION : String(e));
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error("Iniciá sesión como Administrador o Supervisor para ver el acceso remoto.");
    }
    if (!res.ok) {
      // Un servidor viejo (anterior a esta fase) no tiene el endpoint: se
      // trata como "no configurado" en vez de romper la pantalla.
      if (res.status === 404) {
        return {
          estado: "no-configurado",
          url: null,
          alcanzable: null,
          mensaje: null,
          actualizadoEn: null,
        };
      }
      throw new Error(`Acceso remoto HTTP ${res.status}`);
    }
    return (await res.json()) as EstadoAccesoRemoto;
  }
}
