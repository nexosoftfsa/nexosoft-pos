/**
 * Puerto PasarelaDePago.
 *
 * El cobro electrónico es ONLINE: sin conexión, la venta se cierra con el pago
 * registrado como PENDIENTE y se concilia cuando vuelve la red.
 *
 * Idempotencia: cada intento de pago tiene un `intencionPagoId` generado por
 * el POS (UUID). Si la red se cae durante el flujo, se puede reintentar con el
 * mismo id para no cobrar dos veces.
 *
 * Para producción (MercadoPago Point/QR) habrá que:
 *  1. Configurar credenciales (access_token) en ConfiguracionComercio.
 *  2. Implementar MercadoPagoPoint con el SDK oficial (@mercadopago/sdk-js).
 *  3. Manejar el flujo de polling: Point cobra en el dispositivo y notifica vía
 *     webhook o polling; el POS consulta hasta recibir APROBADO/RECHAZADO.
 */

import type { Money } from "@nexosoft/domain";

// ---------------------------------------------------------------------------
// Tipos de datos
// ---------------------------------------------------------------------------

export type MedioPagoElectronico = "tarjeta_credito" | "tarjeta_debito" | "qr" | "point";

export interface SolicitudPago {
  readonly intencionPagoId: string;
  readonly monto: Money;
  readonly medio: MedioPagoElectronico;
  /** Descripción que aparece en el comprobante del cliente. */
  readonly descripcion: string;
}

export type EstadoPagoElectronico = "pendiente" | "aprobado" | "rechazado" | "cancelado";

export interface IntentoPago {
  readonly intencionPagoId: string;
  readonly estado: EstadoPagoElectronico;
  /**
   * Referencia externa del proveedor (ej: payment_id de MercadoPago).
   * Disponible solo cuando el estado es "aprobado".
   */
  readonly referenciaExterna?: string;
  /** Motivo de rechazo si aplica. */
  readonly motivoRechazo?: string;
}

// ---------------------------------------------------------------------------
// Puerto
// ---------------------------------------------------------------------------

export interface PasarelaDePago {
  /**
   * Inicia un cobro electrónico.
   * Resuelve con el intento (generalmente en estado "pendiente").
   */
  iniciarPago(solicitud: SolicitudPago): Promise<IntentoPago>;

  /**
   * Consulta el estado actual de un intento (polling).
   * El POS llama a esto hasta obtener "aprobado", "rechazado" o "cancelado".
   */
  consultarEstado(intencionPagoId: string): Promise<IntentoPago>;

  /**
   * Cancela un intento pendiente (antes de que el cliente confirme).
   * Idempotente: no lanza error si el intento ya estaba cancelado.
   */
  cancelar(intencionPagoId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class ErrorPasarela extends Error {
  constructor(
    public readonly codigo:
      | "SIN_CONEXION"
      | "CREDENCIALES_INVALIDAS"
      | "INTENTO_NO_ENCONTRADO"
      | "ESTADO_INVALIDO",
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorPasarela";
  }
}
