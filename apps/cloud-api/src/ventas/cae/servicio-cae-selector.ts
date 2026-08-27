import { Injectable, Logger } from '@nestjs/common';

import { CertificadoService } from '../../fiscal/certificado.service';
import { ConfiguracionFiscalService } from '../../fiscal/configuracion-fiscal.service';
import { ServicioCaeArca } from './servicio-cae-arca';
import { ServicioCaeMock } from './servicio-cae-mock';
import type { ResultadoCae, ServicioCae, SolicitudCae } from './servicio-cae';

/**
 * Elige, en cada venta, entre ARCA de verdad y el CAE simulado.
 *
 * La decisión se toma en el momento y no al arrancar porque el comercio se da
 * de alta DESPUÉS de instalar el sistema: carga el CUIT, el punto de venta y el
 * certificado desde Configuración, y a partir de la venta siguiente tiene que
 * facturar en serio sin reiniciar el servidor.
 *
 * El mock no es un modo de prueba: es el comercio que todavía no está de alta
 * en ARCA, emitiendo tickets no fiscales. Cambiar a ARCA real cuando faltan los
 * datos dejaría cada venta en PENDIENTE para siempre y el reintento girando en
 * el vacío.
 */
@Injectable()
export class ServicioCaeSelector implements ServicioCae {
  private readonly log = new Logger(ServicioCaeSelector.name);
  /** Sólo para no repetir el mismo log en cada venta. */
  private ultimoModo: 'arca' | 'mock' | null = null;

  constructor(
    private readonly arca: ServicioCaeArca,
    private readonly mock: ServicioCaeMock,
    private readonly config: ConfiguracionFiscalService,
    private readonly certificados: CertificadoService,
  ) {}

  async autorizar(solicitud: SolicitudCae): Promise<ResultadoCae> {
    const usarArca = await this.hayAltaFiscal();
    const modo = usarArca ? 'arca' : 'mock';
    if (modo !== this.ultimoModo) {
      this.ultimoModo = modo;
      this.log.log(
        usarArca
          ? 'Facturación electrónica ACTIVA: los comprobantes se autorizan en ARCA.'
          : 'Sin alta fiscal completa (CUIT, punto de venta o certificado): se emiten comprobantes NO fiscales.',
      );
    }
    return usarArca ? this.arca.autorizar(solicitud) : this.mock.autorizar(solicitud);
  }

  /** Hay datos fiscales completos y certificado en este servidor. */
  private async hayAltaFiscal(): Promise<boolean> {
    try {
      const fiscal = await this.config.obtener();
      if (fiscal === null) return false;
      return this.certificados.materialDeFirma(fiscal.cuit) !== null;
    } catch (e) {
      // Un error leyendo la configuración no puede frenar la venta.
      this.log.warn(`No se pudo determinar el alta fiscal: ${(e as Error).message}`);
      return false;
    }
  }
}
