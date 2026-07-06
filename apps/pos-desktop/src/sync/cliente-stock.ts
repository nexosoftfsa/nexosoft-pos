/**
 * Cliente de STOCK (Fase 7.3). Expone lo que el POS necesita del módulo de stock
 * del cloud-api: saldos por producto, historial de movimientos y registro de
 * movimientos (ingreso por compra, ajuste, salida/merma).
 *
 * Es **online** (ADR-0025). Dos adaptadores: HTTP real (Tauri) y simulado en
 * memoria (desarrollo en el navegador).
 */
import { esFalloDeRed, MENSAJE_SIN_CONEXION } from "./errores-red";

/** Tipos de movimiento del cloud-api. ENTRADA/AJUSTE suman; SALIDA/VENTA restan. */
export type TipoMovimiento = "ENTRADA" | "SALIDA" | "AJUSTE" | "VENTA";

export interface ProductoStock {
  readonly id: string;
  readonly nombre: string;
  readonly codigo: string;
  /** Perecedero: se gestiona por lotes con vencimiento (Fase 8.2). */
  readonly requiereLote?: boolean;
}

/** Saldo de un producto, tal como lo devuelve `GET /stock`. */
export interface SaldoStock {
  readonly producto: ProductoStock;
  readonly saldo: string;
}

/** Un lote de un producto perecedero (`GET /stock/:id/lotes`). */
export interface LoteStock {
  readonly id: string;
  readonly numero: string | null;
  readonly fechaVencimiento: string;
  readonly saldo: string;
}

/** Alerta de vencimiento (`GET /stock/vencimientos`). */
export interface AlertaVencimiento {
  readonly producto: ProductoStock;
  readonly loteId: string;
  readonly numero: string | null;
  readonly fechaVencimiento: string;
  readonly saldo: string;
  readonly diasParaVencer: number;
  readonly vencido: boolean;
}

/** Movimiento de stock, tal como lo devuelve el historial / el POST. */
export interface MovimientoStock {
  readonly id: string;
  readonly tipo: TipoMovimiento;
  readonly cantidad: string;
  readonly motivo: string | null;
  readonly creadoEn: string;
  readonly producto: ProductoStock;
}

/** Datos para registrar un movimiento (`POST /stock/movimientos`). */
export interface DatosMovimiento {
  readonly productoId: string;
  readonly tipo: TipoMovimiento;
  readonly cantidad: string;
  readonly motivo?: string;
  /** ENTRADA de un perecedero: vencimiento (ISO) y número de lote. */
  readonly fechaVencimiento?: string;
  readonly numeroLote?: string;
}

/** Puerto: lo que la pantalla de stock necesita del servidor (testeable con un doble). */
export interface ClienteStock {
  saldos(): Promise<SaldoStock[]>;
  historial(productoId: string): Promise<MovimientoStock[]>;
  registrarMovimiento(datos: DatosMovimiento): Promise<MovimientoStock>;
  /** Lotes con saldo de un producto perecedero (Fase 8.2). */
  lotes(productoId: string): Promise<LoteStock[]>;
  /** Alertas de vencimiento: lotes vencidos o que vencen dentro de `dias`. */
  vencimientos(dias?: number): Promise<AlertaVencimiento[]>;
}

/** Error de stock con el status HTTP (400 = stock insuficiente / cantidad inválida). */
export class ErrorStock extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ErrorStock";
  }
}

export class ClienteStockHttp implements ClienteStock {
  constructor(
    private readonly baseUrl: string,
    private readonly obtenerToken: () => string | null,
  ) {}

  saldos(): Promise<SaldoStock[]> {
    return this.pedir<SaldoStock[]>("GET", "/stock");
  }

  historial(productoId: string): Promise<MovimientoStock[]> {
    return this.pedir<MovimientoStock[]>("GET", `/stock/${productoId}/historial`);
  }

  registrarMovimiento(datos: DatosMovimiento): Promise<MovimientoStock> {
    return this.pedir<MovimientoStock>("POST", "/stock/movimientos", datos);
  }

  lotes(productoId: string): Promise<LoteStock[]> {
    return this.pedir<LoteStock[]>("GET", `/stock/${productoId}/lotes`);
  }

  vencimientos(dias?: number): Promise<AlertaVencimiento[]> {
    const query = dias !== undefined ? `?dias=${dias}` : "";
    return this.pedir<AlertaVencimiento[]>("GET", `/stock/vencimientos${query}`);
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
      throw new ErrorStock(esFalloDeRed(e) ? MENSAJE_SIN_CONEXION : String(e), 0);
    }
    if (!res.ok) {
      throw new ErrorStock(await mensajeDeError(res), res.status);
    }
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
