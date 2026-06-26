/**
 * Adaptador HTTP del puerto `ClienteDeSync` (@nexosoft/sync).
 *
 * Envía la cola al servidor de sucursal vía `POST /sync/operaciones`. Si la red
 * falla, lanza: el `MotorDeSincronizacion` lo trata como reintentable y deja las
 * operaciones pendientes para la próxima corrida.
 */
import type { ClienteDeSync, OperacionSync, ResultadoEnvio } from "@nexosoft/sync";

export class ClienteSyncHttp implements ClienteDeSync {
  /**
   * @param baseUrl    Base del cloud-api, ej. "http://192.168.1.10:3000/api/v1".
   * @param obtenerToken  Devuelve el JWT vigente (o null si no hay sesión).
   */
  constructor(
    private readonly baseUrl: string,
    private readonly obtenerToken: () => string | null,
  ) {}

  async enviar(operaciones: readonly OperacionSync[]): Promise<Record<string, ResultadoEnvio>> {
    const token = this.obtenerToken();
    const res = await fetch(`${this.baseUrl}/sync/operaciones`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token !== null ? { Authorization: `Bearer ${token}` } : {}),
      },
      // Sólo los campos que el endpoint acepta (no `creadaEn`: lo rechazaría
      // el ValidationPipe con forbidNonWhitelisted).
      body: JSON.stringify({
        operaciones: operaciones.map((o) => ({
          operacionId: o.operacionId,
          tipo: o.tipo,
          payload: o.payload,
          terminalId: o.terminalId,
        })),
      }),
    });

    if (!res.ok) {
      throw new Error(`Sync HTTP ${res.status}`);
    }
    return (await res.json()) as Record<string, ResultadoEnvio>;
  }
}
