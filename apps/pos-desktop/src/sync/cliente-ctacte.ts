/**
 * Cliente de CUENTAS CORRIENTES (Fase 7.5). Expone el CRUD de clientes y el
 * ledger de cuenta corriente (cargos = venta a cuenta, pagos = cobros) del
 * cloud-api. Online (ADR-0027), con adaptador HTTP real (Tauri) y simulado en
 * memoria (navegador de desarrollo).
 */
import { esFalloDeRed, MENSAJE_SIN_CONEXION } from "./errores-red";

export type CondicionIva =
  | "CONSUMIDOR_FINAL"
  | "RESPONSABLE_INSCRIPTO"
  | "MONOTRIBUTO"
  | "EXENTO";

export interface Cliente {
  readonly id: string;
  readonly nombre: string;
  readonly documento: string | null;
  readonly condicionIva: CondicionIva;
  readonly email: string | null;
  readonly telefono: string | null;
  readonly direccion: string | null;
  readonly limiteCredito: string;
  readonly activo: boolean;
}

export interface ClienteConSaldo extends Cliente {
  /** Saldo de cuenta corriente. Positivo = el cliente debe. */
  readonly saldo: string;
}

export interface MovimientoCtaCte {
  readonly id: string;
  readonly tipo: "CARGO" | "PAGO";
  readonly monto: string;
  readonly concepto: string | null;
  readonly creadoEn: string;
}

export interface EstadoCuenta {
  readonly cliente: ClienteConSaldo;
  readonly movimientos: MovimientoCtaCte[];
}

/** Datos de alta/edición de cliente. */
export interface DatosCliente {
  readonly nombre: string;
  readonly documento?: string;
  readonly condicionIva?: CondicionIva;
  readonly email?: string;
  readonly telefono?: string;
  readonly direccion?: string;
  readonly limiteCredito?: string;
}

export interface ClienteCtaCte {
  listar(incluirInactivos: boolean): Promise<ClienteConSaldo[]>;
  crear(datos: DatosCliente): Promise<Cliente>;
  actualizar(id: string, cambios: Partial<DatosCliente> & { activo?: boolean }): Promise<Cliente>;
  desactivar(id: string): Promise<void>;
  estadoCuenta(id: string): Promise<EstadoCuenta>;
  registrarCargo(id: string, monto: string, concepto?: string): Promise<ClienteConSaldo>;
  registrarPago(id: string, monto: string, concepto?: string): Promise<ClienteConSaldo>;
}

export class ErrorCtaCte extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ErrorCtaCte";
  }
}

export class ClienteCtaCteHttp implements ClienteCtaCte {
  constructor(
    private readonly baseUrl: string,
    private readonly obtenerToken: () => string | null,
  ) {}

  listar(incluirInactivos: boolean): Promise<ClienteConSaldo[]> {
    return this.pedir<ClienteConSaldo[]>("GET", `/clientes${incluirInactivos ? "?todos=true" : ""}`);
  }

  crear(datos: DatosCliente): Promise<Cliente> {
    return this.pedir<Cliente>("POST", "/clientes", datos);
  }

  actualizar(id: string, cambios: Partial<DatosCliente> & { activo?: boolean }): Promise<Cliente> {
    return this.pedir<Cliente>("PATCH", `/clientes/${id}`, cambios);
  }

  async desactivar(id: string): Promise<void> {
    await this.pedir<unknown>("DELETE", `/clientes/${id}`);
  }

  estadoCuenta(id: string): Promise<EstadoCuenta> {
    return this.pedir<EstadoCuenta>("GET", `/clientes/${id}/estado-cuenta`);
  }

  registrarCargo(id: string, monto: string, concepto?: string): Promise<ClienteConSaldo> {
    return this.pedir<ClienteConSaldo>("POST", `/clientes/${id}/cargos`, {
      monto,
      ...(concepto !== undefined ? { concepto } : {}),
    });
  }

  registrarPago(id: string, monto: string, concepto?: string): Promise<ClienteConSaldo> {
    return this.pedir<ClienteConSaldo>("POST", `/clientes/${id}/pagos`, {
      monto,
      ...(concepto !== undefined ? { concepto } : {}),
    });
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
      throw new ErrorCtaCte(esFalloDeRed(e) ? MENSAJE_SIN_CONEXION : String(e), 0);
    }
    if (!res.ok) throw new ErrorCtaCte(await mensajeDeError(res), res.status);
    return (await res.json().catch(() => null)) as T;
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
