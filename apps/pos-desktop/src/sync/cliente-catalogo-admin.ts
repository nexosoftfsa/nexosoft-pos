/**
 * Cliente de ADMINISTRACIÓN del catálogo (ABM, Fase 7.2). A diferencia del pull
 * de bajada (`ClienteCatalogoHttp`, solo lectura para cachear), este expone el
 * CRUD del cloud-api: alta, edición, baja (desactivación) y categorías.
 *
 * Decisión del usuario (ADR-0025): el ABM es **online** contra el servidor de
 * sucursal en la LAN. Por eso es un puerto con dos adaptadores: HTTP real (Tauri)
 * y un simulado en memoria (desarrollo en el navegador, sin servidor).
 */
import type { TipoIvaRemoto } from "./mapeo-catalogo";
import { esFalloDeRed, MENSAJE_SIN_CONEXION } from "./errores-red";
import type { FilaImportacion } from "./importacion";

export type { FilaImportacion };

export type { TipoIvaRemoto };

/** SIMPLE = producto físico con stock; COMBO = agrupa otros productos (Fase 8.1). */
export type TipoProductoRemoto = "SIMPLE" | "COMBO";

export interface CategoriaAdmin {
  readonly id: string;
  readonly nombre: string;
}

/** Un componente de un combo, con el snapshot del producto que representa. */
export interface ComponenteAdmin {
  readonly componenteId: string;
  readonly cantidad: string;
  readonly componente?: { readonly id: string; readonly codigo: string; readonly nombre: string };
}

/** Producto tal como lo administra el catálogo (incluye la categoría). */
export interface ProductoAdmin {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly descripcion: string | null;
  readonly precioVenta: string;
  readonly precioCosto: string;
  readonly tipoIva: TipoIvaRemoto;
  readonly tipo: TipoProductoRemoto;
  readonly activo: boolean;
  /** Perecedero: se gestiona por lotes con vencimiento (Fase 8.2). */
  readonly requiereLote: boolean;
  readonly categoria: CategoriaAdmin | null;
  /** Presente cuando `tipo` es COMBO. */
  readonly componentes?: readonly ComponenteAdmin[];
}

/** Datos de alta/edición (lo que el formulario envía al servidor). */
export interface DatosProducto {
  readonly codigo: string;
  readonly nombre: string;
  readonly descripcion?: string;
  readonly precioVenta: string;
  readonly precioCosto: string;
  readonly tipoIva: TipoIvaRemoto;
  readonly tipo?: TipoProductoRemoto;
  readonly requiereLote?: boolean;
  readonly componentes?: ReadonlyArray<{ readonly componenteId: string; readonly cantidad: string }>;
  readonly categoriaId?: string | null;
}

/** Nombres de columna que espera `POST /productos/importar` (mismos que `scripts/importar-catalogo.mjs`). */
export const COLUMNAS_IMPORTAR_CATALOGO = {
  codigo: "Código de barras",
  descripcion: "Descripción",
  rubro: "Rubro",
  precioCosto: "Precio Costo",
  porcentajeIva: "% IVA",
  precioVenta: "Precio Venta",
  stock: "Stock",
  activo: "Activo",
} as const;

/** Puerto: lo que la pantalla de ABM necesita del servidor (testeable con un doble). */
export interface ClienteCatalogoAdmin {
  listarProductos(incluirInactivos: boolean): Promise<ProductoAdmin[]>;
  crearProducto(datos: DatosProducto): Promise<ProductoAdmin>;
  actualizarProducto(
    id: string,
    cambios: Partial<DatosProducto> & { readonly activo?: boolean },
  ): Promise<ProductoAdmin>;
  desactivarProducto(id: string): Promise<void>;
  listarCategorias(): Promise<CategoriaAdmin[]>;
  /** Fase 14.B: alta masiva desde Excel. `dryRun: true` no persiste nada, solo valida. */
  importarProductos(filas: readonly Record<string, string>[], dryRun: boolean): Promise<FilaImportacion[]>;
}

/** Error de catálogo con el status HTTP (409 = código duplicado, etc.). */
export class ErrorCatalogoAdmin extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ErrorCatalogoAdmin";
  }
}

export class ClienteCatalogoAdminHttp implements ClienteCatalogoAdmin {
  /**
   * @param baseUrl       Base del cloud-api, ej. "http://192.168.1.10:3000/api/v1".
   * @param obtenerToken  Devuelve el JWT vigente (o null si no hay sesión).
   */
  constructor(
    private readonly baseUrl: string,
    private readonly obtenerToken: () => string | null,
  ) {}

  listarProductos(incluirInactivos: boolean): Promise<ProductoAdmin[]> {
    const query = incluirInactivos ? "?todos=true" : "";
    return this.pedir<ProductoAdmin[]>("GET", `/productos${query}`);
  }

  crearProducto(datos: DatosProducto): Promise<ProductoAdmin> {
    return this.pedir<ProductoAdmin>("POST", "/productos", datos);
  }

  actualizarProducto(
    id: string,
    cambios: Partial<DatosProducto> & { readonly activo?: boolean },
  ): Promise<ProductoAdmin> {
    return this.pedir<ProductoAdmin>("PATCH", `/productos/${id}`, cambios);
  }

  async desactivarProducto(id: string): Promise<void> {
    await this.pedir<unknown>("DELETE", `/productos/${id}`);
  }

  listarCategorias(): Promise<CategoriaAdmin[]> {
    return this.pedir<CategoriaAdmin[]>("GET", "/categorias");
  }

  importarProductos(filas: readonly Record<string, string>[], dryRun: boolean): Promise<FilaImportacion[]> {
    return this.pedir<FilaImportacion[]>("POST", "/productos/importar", { filas, dryRun });
  }

  private async pedir<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
    const token = this.obtenerToken();
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${ruta}`, {
        method: metodo,
        headers: {
          ...(token !== null ? { Authorization: `Bearer ${token}` } : {}),
          ...(cuerpo !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}),
      });
    } catch (e) {
      throw new ErrorCatalogoAdmin(esFalloDeRed(e) ? MENSAJE_SIN_CONEXION : String(e), 0);
    }
    if (!res.ok) {
      throw new ErrorCatalogoAdmin(await mensajeDeError(res), res.status);
    }
    return (await res.json().catch(() => null)) as T;
  }
}

/** Extrae el mensaje de error de una respuesta de NestJS (`{ message }`). */
async function mensajeDeError(res: Response): Promise<string> {
  try {
    const cuerpo = (await res.json()) as { message?: string | string[] };
    const m = cuerpo.message;
    if (Array.isArray(m)) return m.join(". ");
    if (typeof m === "string") return m;
  } catch {
    // sin cuerpo JSON
  }
  return `Error ${res.status} del servidor`;
}
