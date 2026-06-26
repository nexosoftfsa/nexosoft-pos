import type { AlmacenDeOperaciones } from "./almacen-de-operaciones";
import type { EstadoOperacion, OperacionEnCola, OperacionSync } from "./tipos";

/**
 * Adaptador en memoria del almacén de operaciones. Para tests y desarrollo.
 * Preserva el orden de inserción (la cola se procesa FIFO).
 */
export class AlmacenEnMemoria implements AlmacenDeOperaciones {
  private readonly cola = new Map<string, OperacionEnCola>();

  encolar(op: OperacionSync): Promise<void> {
    // Idempotencia local: no re-encolar ni pisar una operación ya conocida.
    if (!this.cola.has(op.operacionId)) {
      this.cola.set(op.operacionId, { ...op, estado: "pendiente", intentos: 0 });
    }
    return Promise.resolve();
  }

  pendientes(limite?: number): Promise<OperacionEnCola[]> {
    const lista = [...this.cola.values()].filter((o) => o.estado === "pendiente");
    return Promise.resolve(limite === undefined ? lista : lista.slice(0, limite));
  }

  marcar(
    operacionId: string,
    estado: EstadoOperacion,
    datos?: { readonly intentos?: number; readonly ultimoError?: string },
  ): Promise<void> {
    const op = this.cola.get(operacionId);
    if (op) {
      op.estado = estado;
      if (datos?.intentos !== undefined) op.intentos = datos.intentos;
      if (datos?.ultimoError !== undefined) op.ultimoError = datos.ultimoError;
    }
    return Promise.resolve();
  }

  obtener(operacionId: string): Promise<OperacionEnCola | undefined> {
    return Promise.resolve(this.cola.get(operacionId));
  }

  todas(): Promise<OperacionEnCola[]> {
    return Promise.resolve([...this.cola.values()]);
  }
}
