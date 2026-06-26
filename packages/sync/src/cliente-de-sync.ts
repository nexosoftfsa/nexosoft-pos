import type { OperacionSync, ResultadoEnvio } from "./tipos";

/**
 * Puerto de transporte hacia el servidor de sucursal.
 *
 * En el POS lo implementa un adaptador HTTP que pega a `POST /sync/operaciones`
 * del cloud-api. En tests se usa un mock.
 */
export interface ClienteDeSync {
  /**
   * Envía un lote de operaciones y devuelve el resultado por `operacionId`.
   * El servidor es idempotente: reenviar una operación ya aplicada es seguro.
   */
  enviar(operaciones: readonly OperacionSync[]): Promise<Record<string, ResultadoEnvio>>;
}
