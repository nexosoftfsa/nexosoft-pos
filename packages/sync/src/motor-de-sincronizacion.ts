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
 * Traduce una falla de transporte al idioma del comercio.
 *
 * `fetch` rechaza con un `TypeError` cuyo mensaje es "Failed to fetch" cuando
 * la conexión ni siquiera se pudo establecer: servidor apagado, sin red, o URL
 * mal configurada. Ese texto crudo terminaba tal cual en la pantalla "Ventas
 * que no llegaron al servidor", donde no le dice nada a quien tiene que
 * resolverlo — que además suele ser el dueño del comercio, no un técnico.
 *
 * Cualquier otro error sí se muestra: puede tener información útil.
 */
export function mensajeDeTransporte(error: unknown): string {
  if (error instanceof TypeError) {
    return "No se pudo conectar con el servidor. Revisá que la PC del servidor esté encendida y que esta terminal tenga red.";
  }
  if (error instanceof Error && error.message.trim() !== "") {
    return `No se pudo enviar al servidor: ${error.message}`;
  }
  return "No se pudo enviar al servidor (error de transporte).";
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
      return { enviadas: 0, completadas: 0, fallidas: 0, pendientes: 0, resultados: {} };
    }

    for (const op of pendientes) {
      await this.almacen.marcar(op.operacionId, "enviando");
    }

    let resultados: Record<string, ResultadoEnvio>;
    // Ver `mensajeDeTransporte` al final del archivo: este texto termina en la
    // pantalla "Ventas que no llegaron al servidor" que mira el comercio.
    try {
      resultados = await this.cliente.enviar(pendientes);
    } catch (error) {
      // Falla de transporte (sin red): todas vuelven a pendiente para reintentar.
      resultados = {};
      const msg = mensajeDeTransporte(error);
      for (const op of pendientes) {
        resultados[op.operacionId] = { ok: false, error: msg, reintentable: true, transporte: true };
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
      // Un corte de red NO gasta el presupuesto de reintentos. El tope existe
      // para dejar de insistir con algo que el servidor rechaza; si nunca
      // llegamos a hablar con él, no hay nada de qué desistir.
      //
      // Pasó en la prueba de campo: con el servidor inalcanzable un par de
      // minutos, la venta agotó los 5 intentos (uno cada 15s) y quedó marcada
      // "con error", obligando al cajero a apretar "Reintentar" a mano por una
      // caída de red que se había resuelto sola. Los intentos se siguen
      // contando para poder verlos, pero no marcan la operación como fallida.
      const noLlegamos = r.transporte === true;
      const agotado = !noLlegamos && (!r.reintentable || intentos >= this.maxIntentos);
      if (agotado) {
        await this.almacen.marcar(op.operacionId, "fallida", { intentos, ultimoError: r.error });
        fallidas += 1;
      } else {
        await this.almacen.marcar(op.operacionId, "pendiente", { intentos, ultimoError: r.error });
        pendientesCount += 1;
      }
    }

    return {
      enviadas: pendientes.length,
      completadas,
      fallidas,
      pendientes: pendientesCount,
      // Se devuelven para que quien encoló pueda usar lo que contestó el
      // servidor — el ticket de la venta necesita el CAE y el número de ARCA.
      resultados,
    };
  }

  /** Operaciones que agotaron los reintentos (requieren intervención). */
  async fallidas(): Promise<OperacionEnCola[]> {
    const todas = await this.almacen.todas();
    return todas.filter((o) => o.estado === "fallida");
  }
}
