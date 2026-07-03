import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { MotorDeRespaldo } from '../respaldo/motor-de-respaldo';
import { SERVICIO_CAE, type ServicioCae } from './cae/servicio-cae';
import { LIBRO_DE_VENTAS, type LibroDeVentas } from './libro/libro-de-ventas';
import type { CrearVentaDto } from './dto/crear-venta.dto';

interface UsuarioCtx {
  id: string;
  email: string;
  sucursalId: string;
}

@Injectable()
export class VentasService {
  private readonly logger = new Logger(VentasService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICIO_CAE) private readonly cae: ServicioCae,
    @Inject(LIBRO_DE_VENTAS) private readonly libro: LibroDeVentas,
    private readonly motor: MotorDeRespaldo,
    private readonly config: ConfigService,
  ) {}

  historial(sucursalId: string) {
    return this.prisma.venta.findMany({
      where: { sucursalId },
      orderBy: { creadaEn: 'desc' },
      include: { items: { include: { producto: { select: { id: true, nombre: true, codigo: true } } } } },
    });
  }

  async obtener(sucursalId: string, id: string) {
    const venta = await this.prisma.venta.findFirst({
      where: { id, sucursalId },
      include: { items: { include: { producto: { select: { id: true, nombre: true, codigo: true } } } } },
    });
    if (!venta) throw new NotFoundException(`Comprobante ${id} no encontrado`);
    return venta;
  }

  /**
   * Anula un comprobante emitiendo una Nota de Crédito por el total (comprobante
   * asociado + CAE mock), marca el original ANULADO y restaura el stock vendido.
   * Todo en una transacción. Ver ADR-0028.
   */
  async anular(sucursalId: string, id: string) {
    const original = await this.obtener(sucursalId, id);
    if (original.estado === 'ANULADA') {
      throw new BadRequestException('El comprobante ya está anulado');
    }
    if (original.tipoComprobante?.startsWith('NotaCredito')) {
      throw new BadRequestException('No se puede anular una Nota de Crédito');
    }

    const tipoNc = notaCreditoDe(original.tipoComprobante);
    const cae = await this.cae.autorizar({
      tipoComprobante: tipoNc,
      total: original.total.toString(),
      sucursalId,
    });

    const notaCredito = await this.prisma.$transaction(async (tx) => {
      const nc = await tx.venta.create({
        data: {
          operacionId: `${original.operacionId}-NC`,
          estado: 'COMPLETADA',
          subtotal: original.subtotal,
          descuento: original.descuento,
          total: original.total,
          medioPago: original.medioPago,
          cae: cae.cae,
          caeFechaVto: cae.caeFechaVto,
          numeroComprobante: cae.numeroComprobante,
          tipoComprobante: cae.tipoComprobante,
          sucursalId,
          usuarioId: original.usuarioId,
          terminalId: original.terminalId,
          comprobanteAsociadoId: original.id,
          items: {
            create: original.items.map((it) => ({
              cantidad: it.cantidad,
              precioUnitario: it.precioUnitario,
              descuento: it.descuento,
              subtotal: it.subtotal,
              productoId: it.productoId,
            })),
          },
        },
        include: { items: true },
      });

      // La mercadería vuelve al stock: una ENTRADA por cada ítem.
      for (const it of original.items) {
        await tx.movimientoStock.create({
          data: {
            tipo: 'ENTRADA',
            cantidad: it.cantidad,
            motivo: `Anulación ${original.tipoComprobante ?? ''} ${original.numeroComprobante ?? ''}`.trim(),
            productoId: it.productoId,
            sucursalId,
            ventaId: nc.id,
          },
        });
      }

      await tx.venta.update({ where: { id: original.id }, data: { estado: 'ANULADA' } });
      return nc;
    });

    return { anulada: await this.obtener(sucursalId, id), notaCredito };
  }

  async registrar(usuario: UsuarioCtx, dto: CrearVentaDto) {
    // Idempotencia (ADR-0005): si la operación ya se registró, la devolvemos.
    const existente = await this.prisma.venta.findUnique({
      where: { operacionId: dto.operacionId },
      include: { items: true },
    });
    if (existente) {
      this.logger.log(`Venta idempotente: ${dto.operacionId} ya existía`);
      return existente;
    }

    // Recalcular totales con Decimal (no confiamos en montos del cliente).
    let subtotal = new Decimal(0);
    const itemsData = dto.items.map((it) => {
      const cantidad = new Decimal(it.cantidad);
      const precioUnitario = new Decimal(it.precioUnitario);
      const descuento = new Decimal(it.descuento ?? '0');
      const subItem = cantidad.mul(precioUnitario).sub(descuento);
      subtotal = subtotal.add(subItem);
      return { cantidad, precioUnitario, descuento, subtotal: subItem, productoId: it.productoId };
    });

    const descuentoGlobal = new Decimal(dto.descuento ?? '0');
    const total = subtotal.sub(descuentoGlobal);
    const tipoComprobante = dto.tipoComprobante ?? 'FacturaB';

    // Autorización fiscal (mock; el real es @nexosoft/fiscal vía ARCA).
    const cae = await this.cae.autorizar({
      tipoComprobante,
      total: total.toString(),
      sucursalId: usuario.sucursalId,
    });

    // Transacción: venta + ítems + movimientos de stock VENTA (atómico).
    const venta = await this.prisma.$transaction(async (tx) => {
      const v = await tx.venta.create({
        data: {
          operacionId: dto.operacionId,
          estado: 'COMPLETADA',
          subtotal,
          descuento: descuentoGlobal,
          total,
          medioPago: dto.medioPago,
          cae: cae.cae,
          caeFechaVto: cae.caeFechaVto,
          numeroComprobante: cae.numeroComprobante,
          tipoComprobante: cae.tipoComprobante,
          sucursalId: usuario.sucursalId,
          usuarioId: usuario.id,
          terminalId: dto.terminalId ?? null,
          items: { create: itemsData },
        },
        include: { items: true },
      });

      // La venta física ya ocurrió: registramos la salida de stock, sin
      // bloquear por stock insuficiente (control de negativo es informativo).
      for (const it of itemsData) {
        await tx.movimientoStock.create({
          data: {
            tipo: 'VENTA',
            cantidad: it.cantidad,
            motivo: `Venta ${dto.operacionId}`,
            productoId: it.productoId,
            sucursalId: usuario.sucursalId,
            ventaId: v.id,
          },
        });
      }

      return v;
    });

    // Efectos posteriores: no deben tumbar una venta ya confirmada.
    await this.registrarEnLibro(venta, usuario.email);
    await this.respaldarSiCorresponde();

    return venta;
  }

  private async registrarEnLibro(
    venta: Awaited<ReturnType<VentasService['historial']>>[number],
    usuarioEmail: string,
  ): Promise<void> {
    try {
      await this.libro.registrar({
        fecha: venta.creadaEn,
        operacionId: venta.operacionId,
        comprobante: `${venta.tipoComprobante ?? ''} ${venta.numeroComprobante ?? ''}`.trim(),
        sucursalId: venta.sucursalId,
        usuario: usuarioEmail,
        medioPago: venta.medioPago,
        cantidadItems: venta.items.length,
        subtotal: venta.subtotal.toString(),
        descuento: venta.descuento.toString(),
        total: venta.total.toString(),
        cae: venta.cae ?? '',
      });
    } catch (error) {
      this.logger.error(`No se pudo actualizar el libro de ventas: ${(error as Error).message}`);
    }
  }

  private async respaldarSiCorresponde(): Promise<void> {
    if (this.config.get<string>('RESPALDO_EN_CADA_VENTA') !== 'true') return;
    try {
      await this.motor.crearRespaldo();
    } catch (error) {
      this.logger.error(`Falló el respaldo post-venta: ${(error as Error).message}`);
    }
  }
}

/** Tipo de Nota de Crédito que corresponde a un comprobante (hereda la letra). */
export function notaCreditoDe(tipoComprobante: string | null): string {
  if (tipoComprobante?.startsWith('Factura')) {
    return tipoComprobante.replace('Factura', 'NotaCredito');
  }
  return 'NotaCreditoB';
}
