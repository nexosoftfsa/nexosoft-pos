/**
 * Adaptador EN MEMORIA del módulo de caja, para el desarrollo en el navegador.
 * Reproduce el contrato del cloud-api: un turno abierto por vez, movimientos de
 * efectivo y arqueo al cerrar. Como en el navegador no hay backend de ventas,
 * `ventasEfectivo` queda en 0 (contra el servidor real sí trae las ventas en
 * efectivo del turno).
 */
import {
  ErrorCaja,
  type ClienteCaja,
  type MovimientoCaja,
  type ResumenCaja,
  type TipoMovimientoCaja,
  type TurnoCaja,
  type TurnoCajaResumen,
} from "./cliente-caja";

const TERMINAL_DEMO = { id: "caja-demo", nombre: "Caja demo" };
const USUARIO_DEMO = "demo@nexosoft.local";

function fmt(n: number): string {
  return n.toFixed(2);
}

export class ClienteCajaSimulado implements ClienteCaja {
  private turno: {
    id: string;
    estado: "ABIERTO" | "CERRADO";
    terminalId: string;
    fondoApertura: number;
    abiertoEn: string;
    cerradoEn: string | null;
    montoContado: number | null;
    diferencia: number | null;
    observaciones: string | null;
    movimientos: MovimientoCaja[];
  } | null = null;
  /** Turnos cerrados, más reciente primero (Fase 12: historial). */
  private historial: Array<TurnoCaja & { terminalId: string }> = [];
  private secuencia = 0;

  private resumen(): ResumenCaja {
    const t = this.turno!;
    const ingresos = t.movimientos
      .filter((m) => m.tipo === "INGRESO")
      .reduce((a, m) => a + Number(m.monto), 0);
    const egresos = t.movimientos
      .filter((m) => m.tipo === "EGRESO")
      .reduce((a, m) => a + Number(m.monto), 0);
    const ventasEfectivo = 0;
    const saldoTeorico = t.fondoApertura + ventasEfectivo + ingresos - egresos;
    return {
      fondoApertura: fmt(t.fondoApertura),
      ventasEfectivo: fmt(ventasEfectivo),
      cantidadVentas: 0,
      ingresos: fmt(ingresos),
      egresos: fmt(egresos),
      saldoTeorico: fmt(saldoTeorico),
      montoContado: t.montoContado === null ? null : fmt(t.montoContado),
      diferencia: t.diferencia === null ? null : fmt(t.diferencia),
    };
  }

  private aTurnoCaja(): TurnoCaja {
    const t = this.turno!;
    return {
      id: t.id,
      estado: t.estado,
      fondoApertura: fmt(t.fondoApertura),
      abiertoEn: t.abiertoEn,
      cerradoEn: t.cerradoEn,
      observaciones: t.observaciones,
      movimientos: t.movimientos.map((m) => ({ ...m })),
      resumen: this.resumen(),
    };
  }

  async turnoActual(): Promise<TurnoCaja | null> {
    return this.turno !== null && this.turno.estado === "ABIERTO" ? this.aTurnoCaja() : null;
  }

  async abrirTurno(terminalId: string, fondoApertura: string): Promise<TurnoCaja> {
    if (this.turno !== null && this.turno.estado === "ABIERTO") {
      throw new ErrorCaja("Ya hay un turno de caja abierto en esta terminal", 409);
    }
    const fondo = Number(fondoApertura);
    if (!Number.isFinite(fondo) || fondo < 0) {
      throw new ErrorCaja("El fondo de apertura no puede ser negativo", 400);
    }
    this.turno = {
      id: `turno-${++this.secuencia}`,
      estado: "ABIERTO",
      terminalId,
      fondoApertura: fondo,
      abiertoEn: new Date().toISOString(),
      cerradoEn: null,
      montoContado: null,
      diferencia: null,
      observaciones: null,
      movimientos: [],
    };
    return this.aTurnoCaja();
  }

  async registrarMovimiento(
    turnoId: string,
    tipo: TipoMovimientoCaja,
    monto: string,
    concepto?: string,
  ): Promise<TurnoCaja> {
    const t = this.turnoAbierto(turnoId);
    const m = Number(monto);
    if (!Number.isFinite(m) || m <= 0) throw new ErrorCaja("El monto debe ser mayor a cero", 400);
    t.movimientos = [
      {
        id: `mov-${++this.secuencia}`,
        tipo,
        monto,
        concepto: concepto ?? null,
        creadoEn: new Date().toISOString(),
      },
      ...t.movimientos,
    ];
    return this.aTurnoCaja();
  }

  async cerrarTurno(
    turnoId: string,
    montoContado: string,
    observaciones?: string,
  ): Promise<TurnoCaja> {
    const t = this.turnoAbierto(turnoId);
    const contado = Number(montoContado);
    if (!Number.isFinite(contado) || contado < 0) {
      throw new ErrorCaja("El monto contado no puede ser negativo", 400);
    }
    const saldoTeorico = Number(this.resumen().saldoTeorico);
    t.montoContado = contado;
    t.diferencia = contado - saldoTeorico;
    t.observaciones = observaciones ?? null;
    t.estado = "CERRADO";
    t.cerradoEn = new Date().toISOString();
    const cerrado = this.aTurnoCaja();
    this.historial.unshift({ ...cerrado, terminalId: t.terminalId });
    return cerrado;
  }

  async listarTurnos(
    opciones: { limite?: number; terminalId?: string } = {},
  ): Promise<TurnoCajaResumen[]> {
    const items =
      opciones.terminalId !== undefined
        ? this.historial.filter((t) => t.terminalId === opciones.terminalId)
        : this.historial;
    const limite = Math.min(Math.max(opciones.limite ?? 30, 1), 100);
    return items.slice(0, limite).map((t) => ({
      id: t.id,
      estado: t.estado,
      fondoApertura: t.fondoApertura,
      abiertoEn: t.abiertoEn,
      cerradoEn: t.cerradoEn,
      montoContado: t.resumen.montoContado,
      diferencia: t.resumen.diferencia,
      observaciones: t.observaciones,
      terminalId: t.terminalId,
      terminal: { nombre: t.terminalId === TERMINAL_DEMO.id ? TERMINAL_DEMO.nombre : t.terminalId },
      usuario: { email: USUARIO_DEMO },
    }));
  }

  async obtenerTurno(id: string): Promise<TurnoCaja> {
    if (this.turno !== null && this.turno.id === id) return this.aTurnoCaja();
    const encontrado = this.historial.find((t) => t.id === id);
    if (!encontrado) throw new ErrorCaja(`Turno ${id} no encontrado`, 404);
    const { terminalId: _terminalId, ...turno } = encontrado;
    return turno;
  }

  private turnoAbierto(turnoId: string) {
    if (this.turno === null || this.turno.id !== turnoId) {
      throw new ErrorCaja(`Turno ${turnoId} no encontrado`, 404);
    }
    if (this.turno.estado !== "ABIERTO") throw new ErrorCaja("El turno ya está cerrado", 400);
    return this.turno;
  }
}
