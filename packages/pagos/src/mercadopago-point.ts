/**
 * MercadoPagoPoint — esqueleto del adaptador real.
 *
 * Esta clase implementa el puerto PasarelaDePago usando el SDK de MercadoPago.
 * Está incompleta a propósito: requiere credenciales reales (access_token) y
 * un dispositivo Point físico (o cuenta de prueba QR) para funcionar.
 *
 * Qué falta para producción:
 *  1. Instalar el SDK: `pnpm add mercadopago` (SDK oficial de Node.js).
 *  2. Pasar `accessToken` desde ConfiguracionComercio (leer de variables de
 *     entorno o del archivo de configuración de Tauri; nunca hardcodear).
 *  3. Implementar el flujo de Point:
 *       - POST /point/integration-api/devices/{deviceId}/payment-intents
 *       - Polling de GET .../payment-intents/{paymentIntentId} hasta terminal.
 *  4. Para QR:
 *       - PUT /instore/orders/qr/seller/collectors/{userId}/pos/{externalPosId}/qrs
 *       - Webhook o polling de GET /merchant_orders/{merchantOrderId}.
 *  5. Manejar reintentos y timeout de red (la red puede perderse durante el cobro).
 *  6. Guardar referenciaExterna en la venta para conciliación posterior.
 *
 * Documentación oficial:
 *  - https://www.mercadopago.com.ar/developers/es/docs/mp-point/integration-api/glossary
 *  - https://www.mercadopago.com.ar/developers/es/docs/qr-code/integration-configuration/qr-dynamic/
 */

import { ErrorPasarela, type IntentoPago, type PasarelaDePago, type SolicitudPago } from "./pasarela.js";

export interface ConfigMercadoPago {
  readonly accessToken: string;
  /** ID del dispositivo Point registrado en la cuenta MP. Solo para Point. */
  readonly deviceId?: string;
  /** External POS id registrado para pagos QR. Solo para QR. */
  readonly posId?: string;
}

export class MercadoPagoPoint implements PasarelaDePago {
  constructor(private readonly config: ConfigMercadoPago) {
    if (!config.accessToken) {
      throw new ErrorPasarela(
        "CREDENCIALES_INVALIDAS",
        "MercadoPagoPoint: se requiere accessToken.",
      );
    }
  }

  async iniciarPago(_solicitud: SolicitudPago): Promise<IntentoPago> {
    // TODO: implementar con SDK de MercadoPago.
    // Por ahora lanza para que el POS muestre el error apropiado.
    throw new ErrorPasarela(
      "CREDENCIALES_INVALIDAS",
      "MercadoPagoPoint: adaptador real no implementado. Usá MockPasarelaDePago en desarrollo.",
    );
  }

  async consultarEstado(_intencionPagoId: string): Promise<IntentoPago> {
    throw new ErrorPasarela(
      "CREDENCIALES_INVALIDAS",
      "MercadoPagoPoint: adaptador real no implementado.",
    );
  }

  async cancelar(_intencionPagoId: string): Promise<void> {
    throw new ErrorPasarela(
      "CREDENCIALES_INVALIDAS",
      "MercadoPagoPoint: adaptador real no implementado.",
    );
  }
}
