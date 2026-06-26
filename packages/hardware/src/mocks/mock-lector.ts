import type { CallbackEscaneo, LectorDeBarras } from "../lector.js";

/**
 * Mock de LectorDeBarras para desarrollo y tests.
 *
 * Usá `simularEscaneo(codigo)` para disparar un escaneo programáticamente
 * y verificar que el POS reacciona correctamente.
 */
export class MockLectorDeBarras implements LectorDeBarras {
  private readonly suscriptores = new Set<CallbackEscaneo>();
  private desconectado = false;

  onEscaneo(cb: CallbackEscaneo): () => void {
    this.suscriptores.add(cb);
    return () => {
      this.suscriptores.delete(cb);
    };
  }

  async desconectar(): Promise<void> {
    this.desconectado = true;
    this.suscriptores.clear();
  }

  /** Dispara un escaneo simulado en todos los suscriptores activos. */
  simularEscaneo(codigo: string): void {
    if (this.desconectado) return;
    for (const cb of this.suscriptores) {
      cb(codigo);
    }
  }

  get cantidadSuscriptores(): number {
    return this.suscriptores.size;
  }
}
