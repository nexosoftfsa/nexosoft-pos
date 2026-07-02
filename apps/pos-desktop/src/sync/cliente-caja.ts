/**
 * Cliente de CAJA (Fase 7.4). Expone lo que el POS necesita del módulo de caja
 * del cloud-api: turno actual de la terminal, apertura, movimientos de efectivo
 * (ingreso/egreso) y cierre con arqueo. Online (ADR-0025/0026), con adaptador
 * HTTP real (Tauri) y simulado en memoria (navegador de desarrollo).
 */

export type EstadoTurno = "ABIERTO" | "CERRADO";
export type TipoMovimientoCaja = "INGRESO" | "EGRESO";

export interface MovimientoCaja {
  readonly id: string;
  readonly tipo: TipoMovimientoCaja;
  readonly monto: string;
  readonly concepto: string | null;
  readonly creadoEn: string;
}

/** Resumen calculado del turno (todos los importes como string con 2 decimales). */
export interface ResumenCaja {
  readonly fondoApertura: string;
  readonly ventasEfectivo: string;
  readonly cantidadVentas: number;
  readonly ingresos: string;
  readonly egresos: string;
  readonly saldoTeorico: string;
  readonly montoContado: string | null;
  readonly diferencia: string | null;
}

export interface TurnoCaja {
  readonly id: string;
  readonly estado: EstadoTurno;
  readonly fondoApertura: string;
  readonly abiertoEn: string;
  readonly cerradoEn: string | null;
  readonly observaciones: string | null;
  readonly movimientos: MovimientoCaja[];
  readonly resumen: ResumenCaja;
}

export interface ClienteCaja {
  turnoActual(terminalId: string): Promise<TurnoCaja | null>;
  abrirTurno(terminalId: string, fondoApertura: string): Promise<TurnoCaja>;
  registrarMovimiento(
    turnoId: string,
    tipo: TipoMovimientoCaja,
    monto: string,
    concepto?: string,
  ): Promise<TurnoCaja>;
  cerrarTurno(turnoId: string, montoContado: string, observaciones?: string): Promise<TurnoCaja>;
}

export class ErrorCaja extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ErrorCaja";
  }
}

export class ClienteCajaHttp implements ClienteCaja {
  constructor(
    private readonly baseUrl: string,
    private readonly obtenerToken: () => string | null,
  ) {}

  turnoActual(terminalId: string): Promise<TurnoCaja | null> {
    return this.pedir<TurnoCaja | null>(
      "GET",
      `/caja/turnos/actual?terminalId=${encodeURIComponent(terminalId)}`,
    );
  }

  abrirTurno(terminalId: string, fondoApertura: string): Promise<TurnoCaja> {
    return this.pedir<TurnoCaja>("POST", "/caja/turnos", { terminalId, fondoApertura });
  }

  registrarMovimiento(
    turnoId: string,
    tipo: TipoMovimientoCaja,
    monto: string,
    concepto?: string,
  ): Promise<TurnoCaja> {
    return this.pedir<TurnoCaja>("POST", `/caja/turnos/${turnoId}/movimientos`, {
      tipo,
      monto,
      ...(concepto !== undefined ? { concepto } : {}),
    });
  }

  cerrarTurno(turnoId: string, montoContado: string, observaciones?: string): Promise<TurnoCaja> {
    return this.pedir<TurnoCaja>("POST", `/caja/turnos/${turnoId}/cerrar`, {
      montoContado,
      ...(observaciones !== undefined ? { observaciones } : {}),
    });
  }

  private async pedir<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
    const token = this.obtenerToken();
    const res = await fetch(`${this.baseUrl}${ruta}`, {
      method: metodo,
      headers: {
        ...(token !== null ? { Authorization: `Bearer ${token}` } : {}),
        ...(cuerpo !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}),
    });
    if (!res.ok) {
      throw new ErrorCaja(await mensajeDeError(res), res.status);
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
