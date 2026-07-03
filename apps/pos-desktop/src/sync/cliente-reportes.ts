/**
 * Cliente de REPORTES (Fase 7.7). Reusa los endpoints `/reportes` de la Fase 6
 * (agregación en el backend con Decimal). Online, con adaptador HTTP real (Tauri)
 * y simulado en memoria (navegador de desarrollo). Restringido a ADMIN/SUPERVISOR
 * por el backend (RolesGuard).
 */
import type { RangoFechas } from "../componentes/reportes-helpers";

export interface ResumenVentas {
  readonly cantidadVentas: number;
  readonly totalVendido: string;
  readonly totalDescuentos: string;
  readonly ticketPromedio: string;
}

export interface PuntoSerie {
  readonly fecha: string;
  readonly total: string;
  readonly cantidad: number;
}

export interface VentaPorMedio {
  readonly medioPago: string;
  readonly total: string;
  readonly cantidad: number;
}

export interface TopProducto {
  readonly productoId: string;
  readonly nombre: string;
  readonly codigo: string;
  readonly cantidad: string;
  readonly monto: string;
}

export interface ClienteReportes {
  resumen(rango: RangoFechas): Promise<ResumenVentas>;
  serie(rango: RangoFechas): Promise<PuntoSerie[]>;
  porMedioPago(rango: RangoFechas): Promise<VentaPorMedio[]>;
  topProductos(rango: RangoFechas, limite?: number): Promise<TopProducto[]>;
}

export class ErrorReportes extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ErrorReportes";
  }
}

export class ClienteReportesHttp implements ClienteReportes {
  constructor(
    private readonly baseUrl: string,
    private readonly obtenerToken: () => string | null,
  ) {}

  private query(rango: RangoFechas, extra?: Record<string, string>): string {
    const p = new URLSearchParams({ desde: rango.desde, hasta: rango.hasta, ...extra });
    return `?${p.toString()}`;
  }

  resumen(rango: RangoFechas): Promise<ResumenVentas> {
    return this.get<ResumenVentas>(`/reportes/ventas/resumen${this.query(rango)}`);
  }

  serie(rango: RangoFechas): Promise<PuntoSerie[]> {
    return this.get<PuntoSerie[]>(`/reportes/ventas/serie${this.query(rango)}`);
  }

  porMedioPago(rango: RangoFechas): Promise<VentaPorMedio[]> {
    return this.get<VentaPorMedio[]>(`/reportes/ventas/por-medio-pago${this.query(rango)}`);
  }

  topProductos(rango: RangoFechas, limite = 10): Promise<TopProducto[]> {
    return this.get<TopProducto[]>(
      `/reportes/productos/top${this.query(rango, { limite: String(limite) })}`,
    );
  }

  private async get<T>(ruta: string): Promise<T> {
    const token = this.obtenerToken();
    const res = await fetch(`${this.baseUrl}${ruta}`, {
      headers: token !== null ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new ErrorReportes(await mensajeDeError(res), res.status);
    return (await res.json()) as T;
  }
}

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
