import { Injectable, Logger } from '@nestjs/common';
import { cuitEsValido, normalizarCuit } from '@nexosoft/domain';

import { PrismaService } from '../prisma/prisma.service';
import type { EntornoArca } from './arca/wsaa';

export interface ConfiguracionFiscal {
  readonly cuit: string;
  readonly razonSocial: string;
  readonly puntoDeVenta: number;
  /** `true` si emite A/B (Responsable Inscripto); `false` si emite C. */
  readonly discriminaIva: boolean;
  readonly entorno: EntornoArca;
}

export interface CambiosConfiguracionFiscal {
  readonly cuit?: string;
  readonly razonSocial?: string;
  readonly puntoDeVenta?: number;
  readonly condicionIvaEmisor?: string;
  readonly arcaEntorno?: string;
}

/**
 * Datos fiscales del comercio, del lado del SERVIDOR.
 *
 * El POS tiene su propia copia para imprimirlos en el ticket, pero para
 * pedirle el CAE a ARCA los necesita el servidor: es el que habla con ARCA, y
 * si cada terminal tuviera su propio punto de venta la numeración se rompería.
 */
@Injectable()
export class ConfiguracionFiscalService {
  private readonly log = new Logger(ConfiguracionFiscalService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** `null` si falta algo para poder facturar. */
  async obtener(): Promise<ConfiguracionFiscal | null> {
    const fila = await this.prisma.configuracionSistema.findUnique({ where: { id: 1 } });
    if (fila === null) return null;
    const cuit = fila.cuit === null ? '' : normalizarCuit(fila.cuit);
    if (!cuitEsValido(cuit) || fila.puntoDeVenta === null || fila.puntoDeVenta <= 0) {
      return null;
    }
    return {
      cuit,
      razonSocial: fila.razonSocial ?? '',
      puntoDeVenta: fila.puntoDeVenta,
      // Monotributo emite comprobantes C, que no discriminan IVA.
      discriminaIva: fila.condicionIvaEmisor === 'ResponsableInscripto',
      entorno: fila.arcaEntorno === 'produccion' ? 'produccion' : 'homologacion',
    };
  }

  async guardar(cambios: CambiosConfiguracionFiscal): Promise<ConfiguracionFiscal | null> {
    const datos = {
      ...(cambios.cuit !== undefined ? { cuit: normalizarCuit(cambios.cuit) } : {}),
      ...(cambios.razonSocial !== undefined ? { razonSocial: cambios.razonSocial } : {}),
      ...(cambios.puntoDeVenta !== undefined ? { puntoDeVenta: cambios.puntoDeVenta } : {}),
      ...(cambios.condicionIvaEmisor !== undefined
        ? { condicionIvaEmisor: cambios.condicionIvaEmisor }
        : {}),
      // El entorno NO se cambia desde el POS junto con el resto: pasar a
      // producción es emitir comprobantes reales y tiene que ser deliberado.
      ...(cambios.arcaEntorno === 'produccion' || cambios.arcaEntorno === 'homologacion'
        ? { arcaEntorno: cambios.arcaEntorno }
        : {}),
    };
    await this.prisma.configuracionSistema.upsert({
      where: { id: 1 },
      create: { id: 1, ...datos },
      update: datos,
    });
    const config = await this.obtener();
    if (config === null) {
      this.log.warn('Datos fiscales guardados pero incompletos: todavía no se puede facturar.');
    }
    return config;
  }
}
