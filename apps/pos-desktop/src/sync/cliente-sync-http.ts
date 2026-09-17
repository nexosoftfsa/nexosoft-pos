/**
 * Adaptador HTTP del puerto `ClienteDeSync` (@nexosoft/sync).
 *
 * Envía la cola al servidor de sucursal vía `POST /sync/operaciones`. Si la red
 * falla, lanza: el `MotorDeSincronizacion` lo trata como reintentable y deja las
 * operaciones pendientes para la próxima corrida.
 */
import type { ClienteDeSync, OperacionSync, ResultadoEnvio } from "@nexosoft/sync";

/**
 * Cuánto se espera al servidor antes de dar el envío por perdido.
 *
 * Existe porque un `fetch` sin tope puede quedarse colgado para siempre —el
 * servidor acepta la conexión y no contesta nunca, que es lo que pasa cuando la
 * PC del servidor se suspende o la red se cae a la mitad— y mientras tanto la
 * corrida no termina: las operaciones se quedan en `enviando`, el motor no las
 * vuelve a mirar y la píldora queda en "Sincronizando…" sin botón.
 *
 * 30 segundos son holgados: un lote de 50 ventas contra un servidor de la LAN
 * tarda menos de uno. Pasado el tope es una falla de transporte como cualquier
 * otra: no gasta reintentos y la cola se vuelve a intentar sola.
 */
const TOPE_ENVIO_MS = 30_000;

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
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/sync/operaciones`, {
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
        signal: AbortSignal.timeout(TOPE_ENVIO_MS),
      });
    } catch (e) {
      // El aborto por tope llega como DOMException, no como el TypeError que
      // `mensajeDeTransporte` sabe traducir: se le pone nombre acá para que el
      // comercio lea algo que signifique algo.
      if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) {
        throw new Error("El servidor no contestó a tiempo. Se vuelve a intentar solo.");
      }
      throw e;
    }

    if (!res.ok) {
      throw new Error(`Sync HTTP ${res.status}`);
    }
    return (await res.json()) as Record<string, ResultadoEnvio>;
  }
}
