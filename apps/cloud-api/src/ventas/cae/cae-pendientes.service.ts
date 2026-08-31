import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { codigoComprobanteArcaOpcional } from '@nexosoft/domain';
import { PrismaService } from '../../prisma/prisma.service';
import { comprobanteAsociadoDe } from './comprobante-asociado';
import { DesgloseDeVentaService } from './desglose-de-venta.service';
import {
  ErrorCaeNoDisponible,
  ErrorCaeRechazado,
  SERVICIO_CAE,
  type ComprobanteAsociadoSolicitud,
  type ServicioCae,
} from './servicio-cae';
import {
  fueraDeVentanaArca,
  motivoVentanaVencida,
  porVencerLaVentanaArca,
} from './ventana-de-fecha';

/**
 * Consigue el CAE de las ventas que se registraron sin él (ADR-0008, Fase 18).
 *
 * Cuando ARCA no responde, la venta se registra igual y queda en
 * `estadoFiscal = PENDIENTE`. Este servicio las va autorizando después.
 *
 * Tres reglas que no son negociables:
 *
 * 1. **En orden y frenando en la primera que falla.** ARCA valida que la
 *    numeración sea correlativa por punto de venta. Si se saltea una pendiente
 *    y autoriza la siguiente, rompe la correlatividad y el comprobante saltado
 *    ya no se puede autorizar nunca.
 * 2. **Un rechazo no se reintenta.** Si ARCA dice que el comprobante está mal,
 *    volver a mandarlo igual no cambia nada; queda marcado para corregirlo a
 *    mano.
 * 3. **Nunca toca la venta en sí.** Sólo el estado fiscal. La venta ocurrió,
 *    se cobró y se entregó la mercadería: eso no se deshace.
 */
@Injectable()
export class CaePendientesService {
  private readonly log = new Logger(CaePendientesService.name);
  /** Cuántas se intentan por corrida, para no colgar el servidor. */
  private readonly TOPE_POR_CORRIDA = 25;
  /** Ya se está ejecutando: el cron no se pisa consigo mismo. */
  private corriendo = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICIO_CAE) private readonly cae: ServicioCae,
    private readonly desgloses: DesgloseDeVentaService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async reintentar(): Promise<{ autorizadas: number; pendientes: number; rechazadas: number }> {
    if (this.corriendo) {
      return { autorizadas: 0, pendientes: 0, rechazadas: 0 };
    }
    this.corriendo = true;
    try {
      return await this.procesar();
    } finally {
      this.corriendo = false;
    }
  }

  /** Cuántas ventas están esperando el CAE, por sucursal. */
  async pendientes(sucursalId: string) {
    return this.prisma.venta.findMany({
      where: { sucursalId, estadoFiscal: { in: ['PENDIENTE', 'RECHAZADA'] } },
      orderBy: { creadaEn: 'asc' },
      select: {
        id: true,
        creadaEn: true,
        tipoComprobante: true,
        numeroComprobante: true,
        total: true,
        estadoFiscal: true,
        motivoFiscal: true,
        intentosCae: true,
        ultimoIntentoCae: true,
      },
    });
  }

  private async procesar() {
    const pendientes = await this.prisma.venta.findMany({
      where: { estadoFiscal: 'PENDIENTE' },
      // En orden de emisión: la correlatividad de ARCA lo exige.
      orderBy: { creadaEn: 'asc' },
      take: this.TOPE_POR_CORRIDA,
    });
    if (pendientes.length === 0) return { autorizadas: 0, pendientes: 0, rechazadas: 0 };

    this.log.log(`${pendientes.length} venta(s) esperando CAE.`);
    let autorizadas = 0;
    let rechazadas = 0;

    const ahora = new Date();
    for (const venta of pendientes) {
      const tipoComprobante = venta.tipoComprobante ?? 'FacturaB';

      // ARCA no autoriza un comprobante con fecha de más de 5 días. Mandarlo
      // igual sería un rechazo seguro, y encima uno que no explica nada.
      if (fueraDeVentanaArca(venta.creadaEn, ahora)) {
        const motivo = motivoVentanaVencida(venta.creadaEn, ahora);
        await this.marcar(venta.id, 'RECHAZADA', motivo);
        this.log.error(`Venta ${venta.id} sin CAE y fuera de plazo: ${motivo}`);
        rechazadas += 1;
        continue;
      }
      if (porVencerLaVentanaArca(venta.creadaEn, ahora)) {
        this.log.warn(
          `La venta ${venta.id} lleva días esperando el CAE y se acerca al plazo que acepta ARCA. ` +
            'Si sigue sin autorizarse, va a haber que regularizarla a mano.',
        );
      }

      try {
        // El desglose se reconstruye desde los ítems guardados. Mandar sólo el
        // total dejaría la factura con IVA en cero: ARCA la rechazaría, y si la
        // aceptara sería peor.
        const desglose = await this.desgloses.deVentaGuardada(
          venta.id,
          tipoComprobante,
          venta.total,
        );
        const receptor = await this.desgloses.receptorDe(venta.clienteId ?? null);
        const codigoComprobante = codigoComprobanteArcaOpcional(tipoComprobante);
        // Si la pendiente es una Nota de Crédito, ARCA exige que diga qué
        // comprobante corrige. Se reconstruye desde el original guardado, igual
        // que el desglose de IVA.
        const asociados = await this.asociadosDe(venta.comprobanteAsociadoId ?? null);
        const cae = await this.cae.autorizar({
          tipoComprobante,
          total: venta.total.toFixed(2),
          sucursalId: venta.sucursalId,
          // La fecha del comprobante es la de la venta, no la del reintento:
          // es la que ya salió impresa en el ticket del cliente.
          fecha: venta.creadaEn,
          neto: desglose.neto.aDecimalString(2),
          iva: desglose.iva.aDecimalString(2),
          exento: desglose.exento.aDecimalString(2),
          renglonesIva: desglose.porAlicuota.map((r) => ({
            codigoArca: r.codigoArca,
            base: r.base.aDecimalString(2),
            importe: r.importe.aDecimalString(2),
          })),
          tipoDocReceptor: receptor.tipoDocReceptor,
          nroDocReceptor: receptor.nroDocReceptor,
          condicionIvaReceptor: receptor.condicionIvaReceptor,
          ...(codigoComprobante !== null ? { codigoComprobante } : {}),
          ...(asociados.length > 0 ? { comprobantesAsociados: asociados } : {}),
        });
        await this.prisma.venta.update({
          where: { id: venta.id },
          data: {
            cae: cae.cae,
            caeFechaVto: cae.caeFechaVto,
            // El número lo asigna ARCA, y hay que guardarlo: mientras la venta
            // estuvo pendiente llevó un número provisorio del servidor, que no
            // tiene por qué coincidir con el que ARCA terminó autorizando.
            // Dejarlo sin actualizar dejaba el comprobante con un número y el
            // CAE correspondiendo a otro: un comprobante mal emitido.
            numeroComprobante: cae.numeroComprobante,
            estadoFiscal: 'AUTORIZADA',
            motivoFiscal: null,
            intentosCae: { increment: 1 },
            ultimoIntentoCae: new Date(),
          },
        });
        autorizadas += 1;
      } catch (e) {
        if (e instanceof ErrorCaeRechazado) {
          // No se reintenta, pero se sigue con las demás: un comprobante mal
          // armado no tiene por qué frenar a los que vienen atrás.
          await this.marcar(venta.id, 'RECHAZADA', e.message);
          rechazadas += 1;
          continue;
        }
        if (e instanceof ErrorCaeNoDisponible) {
          // ARCA sigue sin responder. Se corta acá: intentar con la siguiente
          // rompería la correlatividad si esta después se autoriza.
          await this.marcar(venta.id, 'PENDIENTE', e.message);
          this.log.warn(`ARCA sigue sin responder (${e.message}). Se reintenta en la próxima.`);
          break;
        }
        throw e;
      }
    }

    const quedan = await this.prisma.venta.count({ where: { estadoFiscal: 'PENDIENTE' } });
    if (autorizadas > 0) this.log.log(`${autorizadas} venta(s) autorizadas por ARCA.`);
    if (rechazadas > 0) this.log.error(`${rechazadas} venta(s) RECHAZADAS: hay que corregirlas.`);
    return { autorizadas, pendientes: quedan, rechazadas };
  }

  /** `CbtesAsoc` de una Nota de Crédito pendiente, desde el original que anula. */
  private async asociadosDe(
    comprobanteAsociadoId: string | null,
  ): Promise<ComprobanteAsociadoSolicitud[]> {
    if (comprobanteAsociadoId === null) return [];
    const original = await this.prisma.venta.findUnique({
      where: { id: comprobanteAsociadoId },
      select: { tipoComprobante: true, numeroComprobante: true },
    });
    return original === null ? [] : comprobanteAsociadoDe(original);
  }

  private async marcar(id: string, estadoFiscal: 'PENDIENTE' | 'RECHAZADA', motivo: string) {
    await this.prisma.venta.update({
      where: { id },
      data: {
        estadoFiscal,
        motivoFiscal: motivo,
        intentosCae: { increment: 1 },
        ultimoIntentoCae: new Date(),
      },
    });
  }
}
