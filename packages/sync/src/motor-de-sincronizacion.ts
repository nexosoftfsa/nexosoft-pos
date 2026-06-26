import type { AlmacenDeOperaciones } from "./almacen-de-operaciones";
import type { ClienteDeSync } from "./cliente-de-sync";
import type { OperacionEnCola, ResultadoEnvio, ResumenSync } from "./tipos";

export interface OpcionesSync {
  /** Reintentos antes de marcar una operación como `fallida`. */
  readonly maxIntentos?: number;
  /** Cuántas operaciones enviar por corrida. */
  readonly loteTam?: number;
}

/**
 * Motor de la cola outbox (ADR-0005). Encola operaciones locales y las sube al
 * servidor de sucursal cuando hay red, con reintentos e idempotencia.
 *
 * No sabe de HTTP ni de SQLite: depende de los puertos `AlmacenDeOperaciones`
 * (persistencia) y `ClienteDeSync` (transporte), así es testeable sin red.
 */
export class MotorDeSincronizacion {
  private readonly maxIntentos: number;
  private readonly loteTam: number;

  constructor(
    private readonly almacen: AlmacenDeOperaciones,
    private readonly cliente: ClienteDeSync,
    opciones: OpcionesSync = {},
  ) {
    this.maxIntentos = opciones.maxIntentos ?? 5;
    this.loteTam = opciones.loteTam ?? 50;
  }

  /** Agrega una operación a la cola (estado `pendiente`). */
  encolar(op: Parameters<AlmacenDeOperaciones["encolar"]>[0]): Promise<void> {
    return this.almacen.encolar(op);
  }

  /**
   * Procesa un lote de pendientes: las envía y actualiza su estado según el
   * resultado. No lanza si una operación falla; la deja para reintentar o la
   * marca `fallida` al superar `maxIntentos`.
   */
  async sincronizar(): Promise<ResumenSync> {
    const pendientes = await this.almacen.pendientes(this.loteTam);
    if (pendientes.length === 0) {
      return { enviadas: 0, completadas: 0, fallidas: 0, pendientes: 0 };
    }

    for (const op of pendientes) {
      await this.almacen.marcar(op.operacionId, "enviando");
    }

    let resultados: Record<string, ResultadoEnvio>;
    try {
      resultados = await this.cliente.enviar(pendientes);
    } catch (error) {
      // Falla de transporte (sin red): todas vuelven a pendiente para reintentar.
      resultados = {};
      const msg = error instanceof Error ? error.message : "error de transporte";
      for (const op of pendientes) {
        resultados[op.operacionId] = { ok: false, error: msg, reintentable: true };
      }
    }

    let completadas = 0;
    let fallidas = 0;
    let pendientesCount = 0;

    for (const op of pendientes) {
      const r = resultados[op.operacionId] ?? {
        ok: false as const,
        error: "el servidor no devolvió resultado para esta operación",
        reintentable: true,
      };

      if (r.ok) {
        await this.almacen.marcar(op.operacionId, "completada");
        completadas += 1;
        continue;
      }

      const intentos = op.intentos + 1;
      const agotado = !r.reintentable || intentos >= this.maxIntentos;
      if (agotado) {
        await this.almacen.marcar(op.operacionId, "fallida", { intentos, ultimoError: r.error });
        fallidas += 1;
      } else {
        await this.almacen.marcar(op.operacionId, "pendiente", { intentos, ultimoError: r.error });
        pendientesCount += 1;
      }
    }

    return { enviadas: pendientes.length, completadas, fallidas, pendientes: pendientesCount };
  }

  /** Operaciones que agotaron los reintentos (requieren intervención). */
  async fallidas(): Promise<OperacionEnCola[]> {
    const todas = await this.almacen.todas();
    return todas.filter((o) => o.estado === "fallida");
  }
}
