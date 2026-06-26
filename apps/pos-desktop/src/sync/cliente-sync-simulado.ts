/**
 * Cliente de sync SIMULADO para desarrollo en el navegador (sin servidor).
 *
 * Acepta las operaciones tras una pequeña demora, así el indicador de la UI
 * muestra el ciclo real: pendiente → sincronizando → completada. En Tauri /
 * producción se reemplaza por `ClienteSyncHttp`.
 */
import type { ClienteDeSync, OperacionSync, ResultadoEnvio } from "@nexosoft/sync";

export class ClienteSyncSimulado implements ClienteDeSync {
  constructor(private readonly opciones: { readonly demoraMs?: number } = {}) {}

  async enviar(operaciones: readonly OperacionSync[]): Promise<Record<string, ResultadoEnvio>> {
    const demora = this.opciones.demoraMs ?? 600;
    if (demora > 0) await new Promise((r) => setTimeout(r, demora));

    const resultados: Record<string, ResultadoEnvio> = {};
    for (const op of operaciones) {
      resultados[op.operacionId] = { ok: true, idRemoto: `sim-${op.operacionId}` };
    }
    return resultados;
  }
}
