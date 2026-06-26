import { Injectable, Inject, Logger } from '@nestjs/common';
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
      include: { items: true },
    });
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
