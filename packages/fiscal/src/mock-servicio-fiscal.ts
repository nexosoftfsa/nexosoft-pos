/**
 * `MockServicioFiscal`: implementación de `ServicioFiscal` que simula ARCA SIN red.
 * No es un stub vacío: respeta las reglas que valida WSFEv1, para que el salto al
 * ARCA real sea de bajo riesgo (ADR-0008):
 *  - **Numeración consecutiva** por punto de venta y tipo.
 *  - **`total = neto + IVA`** (coherencia de importes).
 *  - **Comprobante C sin IVA** (Monotributo no discrimina).
 *
 * Permite forzar rechazos y desactivar la validación de numeración para tests.
 */
import { EstadoCae, letraDe, type TipoComprobante } from "@nexosoft/domain";

import type { ResultadoCae, ServicioFiscal, SolicitudCae } from "./servicio-fiscal.js";

export interface OpcionesMockFiscal {
  /** Si `true`, rechaza toda solicitud (para probar el camino de rechazo). */
  readonly forzarRechazo?: boolean;
  /** Validar numeración consecutiva. Por defecto, `true`. */
  readonly validarNumeracion?: boolean;
}

/** Días de validez del CAE simulado. */
const DIAS_VENCIMIENTO_CAE = 10;

function rechazo(codigo: number, mensaje: string): ResultadoCae {
  return { estado: EstadoCae.Rechazada, errores: [{ codigo, mensaje }] };
}

export class MockServicioFiscal implements ServicioFiscal {
  private readonly ultimos = new Map<string, number>();
  /** CAE simulado de 14 dígitos, incremental para que los tests sean estables. */
  private secuenciaCae = 70000000000000;

  constructor(private readonly opciones: OpcionesMockFiscal = {}) {}

  private clave(puntoDeVenta: number, tipo: TipoComprobante): string {
    return `${puntoDeVenta}:${tipo}`;
  }

  async ultimoNumeroAutorizado(puntoDeVenta: number, tipo: TipoComprobante): Promise<number> {
    return this.ultimos.get(this.clave(puntoDeVenta, tipo)) ?? 0;
  }

  async solicitarCae(solicitud: SolicitudCae): Promise<ResultadoCae> {
    if (this.opciones.forzarRechazo === true) {
      return rechazo(600, "Rechazo simulado por configuración del mock.");
    }

    const clave = this.clave(solicitud.puntoDeVenta, solicitud.tipoComprobante);
    const ultimo = this.ultimos.get(clave) ?? 0;

    if (this.opciones.validarNumeracion !== false && solicitud.numero !== ultimo + 1) {
      return rechazo(
        10016,
        `Numeración no consecutiva: se esperaba ${ultimo + 1} y llegó ${solicitud.numero}.`,
      );
    }

    if (!solicitud.netoGravado.sumar(solicitud.iva).igualA(solicitud.total)) {
      return rechazo(10048, "El total no coincide con neto gravado + IVA.");
    }

    if (letraDe(solicitud.tipoComprobante) === "C" && !solicitud.iva.esCero()) {
      return rechazo(10051, "Un comprobante C (Monotributo) no puede tener IVA.");
    }

    // Autorizado.
    this.ultimos.set(clave, solicitud.numero);
    const cae = String(this.secuenciaCae);
    this.secuenciaCae += 1;
    const vencimientoCae = new Date(
      solicitud.fecha.getTime() + DIAS_VENCIMIENTO_CAE * 24 * 60 * 60 * 1000,
    );
    return { estado: EstadoCae.Autorizada, cae, vencimientoCae };
  }
}
