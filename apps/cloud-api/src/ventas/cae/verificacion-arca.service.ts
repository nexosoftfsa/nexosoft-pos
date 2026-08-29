import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { codigoComprobanteArcaOpcional } from '@nexosoft/domain';

import { PrismaService } from '../../prisma/prisma.service';
import { ServicioCaeArca } from './servicio-cae-arca';
import { compararConArca, type VerificacionArca } from './verificacion-arca';

/**
 * "Verificar en ARCA": le pregunta a ARCA qué tiene registrado de un
 * comprobante que ya emitimos, y lo compara con lo que guardamos nosotros.
 *
 * Existe porque en **homologación** el comprobante no aparece en ninguna página
 * pública de ARCA —el verificador del QR y "Mis Comprobantes" consultan
 * producción—, así que no había forma de confirmar que ARCA lo hubiera
 * registrado de verdad. Y en producción sirve para lo mismo sin salir del POS.
 *
 * Es de **sólo lectura**: usa `FECompConsultar`, no emite ni modifica nada.
 */
@Injectable()
export class VerificacionArcaService {
  private readonly log = new Logger(VerificacionArcaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly arca: ServicioCaeArca,
  ) {}

  async verificar(sucursalId: string, ventaId: string): Promise<VerificacionArca> {
    const venta = await this.prisma.venta.findFirst({
      where: { id: ventaId, sucursalId },
      select: {
        tipoComprobante: true,
        numeroComprobante: true,
        total: true,
        cae: true,
        estadoFiscal: true,
      },
    });
    if (venta === null) throw new NotFoundException(`Comprobante ${ventaId} no encontrado`);

    const codigoComprobante = codigoComprobanteArcaOpcional(venta.tipoComprobante);
    if (codigoComprobante === null || venta.numeroComprobante === null) {
      return {
        estado: 'NO_APLICA',
        mensaje:
          'Este comprobante no es fiscal: no existe en ARCA y no hay nada que verificar.',
        diferencias: [],
      };
    }

    try {
      const { resultado, entorno, puntoDeVenta } = await this.arca.consultar(
        codigoComprobante,
        venta.numeroComprobante,
      );
      return compararConArca({
        enArca: resultado,
        local: { cae: venta.cae, total: venta.total.toFixed(2) },
        entorno,
        puntoDeVenta,
        numero: venta.numeroComprobante,
      });
    } catch (e) {
      // Que la consulta falle no dice nada del comprobante: puede estar
      // perfecto y ser ARCA la que no contesta. Se informa como tal.
      this.log.warn(`No se pudo verificar ${ventaId} contra ARCA: ${(e as Error).message}`);
      return {
        estado: 'NO_SE_PUDO',
        mensaje: `No se pudo consultar a ARCA: ${(e as Error).message}`,
        diferencias: [],
      };
    }
  }
}
