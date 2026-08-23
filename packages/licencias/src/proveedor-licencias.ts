import { EstadoSuscripcion, type Licencia } from "./licencia";

/**
 * Puerto hacia el servicio de licencias (CLAUDE.md §6, ADR-0056 §5).
 *
 * La implementación real habla con el Worker de `licencias.nexosoft.com.ar`;
 * `MockProveedorLicencias` permite implementar y testear todo el lado del
 * comercio antes de que el Worker exista.
 */
export interface ProveedorLicencias {
  /**
   * Pide la licencia vigente del comercio.
   *
   * Devuelve `null` cuando no se pudo obtener (sin internet, Worker caído).
   * **Nunca lanza por falta de red**: quien llama tiene que poder seguir
   * operando con la última licencia que tenga guardada.
   */
  obtener(comercioId: string): Promise<Licencia | null>;
}

/** Licencia al día, para desarrollo y tests. */
export function licenciaActiva(comercioId = "demo", ahora: Date = new Date()): Licencia {
  return {
    comercioId,
    estado: EstadoSuscripcion.Activa,
    vencePagoEl: sumarDiasIso(ahora, 30).slice(0, 10),
    validaHasta: sumarDiasIso(ahora, 7),
    emitidaEn: ahora.toISOString(),
  };
}

/**
 * Proveedor de mentira para desarrollo y tests. Se le puede fijar qué
 * devolver, incluso simular que no hay internet.
 */
export class MockProveedorLicencias implements ProveedorLicencias {
  private respuesta: Licencia | null;
  /** Cuántas veces se le pidió la licencia (para verificar la renovación). */
  public pedidos = 0;

  constructor(respuesta: Licencia | null = licenciaActiva()) {
    this.respuesta = respuesta;
  }

  obtener(_comercioId: string): Promise<Licencia | null> {
    this.pedidos += 1;
    return Promise.resolve(this.respuesta);
  }

  /** Cambia lo que va a devolver de acá en más. `null` simula estar sin red. */
  configurar(respuesta: Licencia | null): void {
    this.respuesta = respuesta;
  }
}

function sumarDiasIso(desde: Date, dias: number): string {
  const d = new Date(desde.getTime());
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString();
}
