import { Injectable } from '@nestjs/common';
import { addDays } from 'date-fns';
import type { ServicioCae, SolicitudCae, ResultadoCae } from './servicio-cae';

/**
 * Mock funcional del servicio de CAE. Asigna un CAE y número de comprobante
 * simulados, suficiente para registrar y probar ventas sin ARCA.
 * NO sirve para producción: el comprobante no tiene validez fiscal.
 */
@Injectable()
export class ServicioCaeMock implements ServicioCae {
  private contador = 0;

  autorizar(solicitud: SolicitudCae): Promise<ResultadoCae> {
    this.contador += 1;

    // CAE simulado: 14 dígitos como el real, pero generado localmente.
    const cae = String(Date.now()).padStart(14, '0').slice(-14);

    return Promise.resolve({
      cae,
      caeFechaVto: addDays(new Date(), 10),
      numeroComprobante: this.contador,
      tipoComprobante: solicitud.tipoComprobante,
    });
  }
}
