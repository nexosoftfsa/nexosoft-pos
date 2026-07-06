/**
 * Cliente HTTP de BAJADA del catálogo: descarga productos y stock del servidor de
 * sucursal (`GET /productos`, `GET /stock`) para cachearlos en el SQLite local.
 * Complementa a `ClienteSyncHttp` (subida de ventas). Ambos van con el JWT.
 */
import type { ProductoRemoto, SaldoRemoto } from "./mapeo-catalogo";
import { esFalloDeRed, MENSAJE_SIN_CONEXION } from "./errores-red";

/** Puerto: lo que el pull necesita del servidor (testeable con un doble). */
export interface ClienteCatalogo {
  descargarProductos(): Promise<ProductoRemoto[]>;
  descargarStock(): Promise<SaldoRemoto[]>;
}

export class ClienteCatalogoHttp implements ClienteCatalogo {
  /**
   * @param baseUrl       Base del cloud-api, ej. "http://192.168.1.10:3000/api/v1".
   * @param obtenerToken  Devuelve el JWT vigente (o null si no hay sesión).
   */
  constructor(
    private readonly baseUrl: string,
    private readonly obtenerToken: () => string | null,
  ) {}

  async descargarProductos(): Promise<ProductoRemoto[]> {
    return this.get<ProductoRemoto[]>("/productos");
  }

  async descargarStock(): Promise<SaldoRemoto[]> {
    return this.get<SaldoRemoto[]>("/stock");
  }

  private async get<T>(ruta: string): Promise<T> {
    const token = this.obtenerToken();
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${ruta}`, {
        headers: token !== null ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch (e) {
      throw new Error(esFalloDeRed(e) ? MENSAJE_SIN_CONEXION : String(e));
    }
    if (!res.ok) {
      throw new Error(`Catálogo HTTP ${res.status} en ${ruta}`);
    }
    return (await res.json()) as T;
  }
}
