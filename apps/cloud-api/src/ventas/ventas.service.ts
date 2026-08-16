import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Decimal } from '@prisma/client/runtime/library';
import { MedioPago } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MotorDeRespaldo } from '../respaldo/motor-de-respaldo';
import { SERVICIO_CAE, type ServicioCae } from './cae/servicio-cae';
import { LIBRO_DE_VENTAS, type LibroDeVentas } from './libro/libro-de-ventas';
import type { CrearVentaDto } from './dto/crear-venta.dto';
import { expandirStockDeVenta, type ComponenteCombo } from './combo';
import { asignarFefo, type LoteConSaldo } from '../stock/fefo';

/** Un tramo de salida de stock: cantidad y (para perecederos) el lote imputado. */
interface TramoStock {
  productoId: string;
  cantidad: Decimal;
  loteId: string | null;
}

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
      include: {
        items: { include: { producto: { select: { id: true, nombre: true, codigo: true } } } },
        pagos: true,
      },
    });
  }

  async obtener(sucursalId: string, id: string) {
    const venta = await this.prisma.venta.findFirst({
      where: { id, sucursalId },
      include: {
        items: { include: { producto: { select: { id: true, nombre: true, codigo: true } } } },
        pagos: true,
      },
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
    // Fase 10.1: un TicketNoFiscal no tiene Nota de Crédito (no es fiscal) — se
    // anula reflejando el mismo tipo, sin pedir CAE.
    const cae = esComprobanteFiscal(tipoNc)
      ? await this.cae.autorizar({
          tipoComprobante: tipoNc,
          total: original.total.toString(),
          sucursalId,
        })
      : null;

    const notaCredito = await this.prisma.$transaction(async (tx) => {
      const nc = await tx.venta.create({
        data: {
          operacionId: `${original.operacionId}-NC`,
          estado: 'COMPLETADA',
          subtotal: original.subtotal,
          descuento: original.descuento,
          total: original.total,
          medioPago: original.medioPago,
          cae: cae?.cae ?? null,
          caeFechaVto: cae?.caeFechaVto ?? null,
          numeroComprobante: cae?.numeroComprobante ?? null,
          tipoComprobante: cae?.tipoComprobante ?? tipoNc,
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

      // La mercadería vuelve al stock. Espejamos los movimientos VENTA reales de
      // la venta original (no sus ítems): así un combo restaura el stock de sus
      // componentes exactamente como se descontó, sin depender de la composición
      // actual del combo (ADR-0033).
      const movimientosVenta = await tx.movimientoStock.findMany({
        where: { ventaId: original.id, tipo: 'VENTA' },
      });
      const motivo = `Anulación ${original.tipoComprobante ?? ''} ${original.numeroComprobante ?? ''}`.trim();
      for (const m of movimientosVenta) {
        await tx.movimientoStock.create({
          data: {
            tipo: 'ENTRADA',
            cantidad: m.cantidad,
            motivo,
            productoId: m.productoId,
            sucursalId,
            ventaId: nc.id,
            // Devuelve la mercadería al MISMO lote del que salió (perecederos).
            loteId: m.loteId ?? null,
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
      return {
        cantidad,
        precioUnitario,
        descuento,
        subtotal: subItem,
        productoId: it.productoId,
        costoUnitario: it.costoUnitario !== undefined ? new Decimal(it.costoUnitario) : null,
      };
    });

    const descuentoGlobal = new Decimal(dto.descuento ?? '0');
    const recargoGlobal = new Decimal(dto.recargo ?? '0');
    const total = subtotal.sub(descuentoGlobal).add(recargoGlobal);
    const tipoComprobante = dto.tipoComprobante ?? 'FacturaB';

    // Combos: resolvemos qué ítems son combos para descontar el stock de sus
    // componentes en vez del combo (ADR-0033).
    const componentesPorCombo = await this.componentesDeCombos(
      itemsData.map((it) => it.productoId),
    );
    // Movimientos de stock ya expandidos (combo→componentes) y con los lotes
    // asignados por FEFO para los perecederos (ADR-0034).
    const tramosStock = await this.planificarStockDeVenta(
      usuario.sucursalId,
      expandirStockDeVenta(itemsData, componentesPorCombo),
    );

    // Pago combinado: si viene el desglose, el medioPago resumen es el único
    // medio (si todos coinciden) o COMBINADO. Sin desglose, se usa dto.medioPago.
    const pagos = dto.pagos ?? [];
    const medioPagoResumen = resumenMedioPago(pagos, dto.medioPago);

    // Fiado (ADR-0037): la parte pagada con CUENTA_CORRIENTE va a la deuda del
    // cliente. Con desglose, se suma lo marcado CC; sin desglose, si el medio es
    // CC, va el total. La venta ya ocurrió: no se bloquea por límite de crédito.
    const montoCuentaCorriente =
      pagos.length > 0
        ? pagos
            .filter((p) => p.medioPago === 'CUENTA_CORRIENTE')
            .reduce((a, p) => a.add(new Decimal(p.monto)), new Decimal(0))
        : dto.medioPago === 'CUENTA_CORRIENTE'
          ? total
          : new Decimal(0);

    // Autorización fiscal (mock; el real es @nexosoft/fiscal vía ARCA).
    // Fase 10.1: un TicketNoFiscal (comercio sin alta en ARCA) no pide CAE.
    const cae = esComprobanteFiscal(tipoComprobante)
      ? await this.cae.autorizar({
          tipoComprobante,
          total: total.toString(),
          sucursalId: usuario.sucursalId,
        })
      : null;

    // Transacción: venta + ítems + pagos + movimientos de stock VENTA (atómico).
    const venta = await this.prisma.$transaction(async (tx) => {
      const v = await tx.venta.create({
        data: {
          operacionId: dto.operacionId,
          estado: 'COMPLETADA',
          subtotal,
          descuento: descuentoGlobal,
          total,
          medioPago: medioPagoResumen,
          cae: cae?.cae ?? null,
          caeFechaVto: cae?.caeFechaVto ?? null,
          numeroComprobante: cae?.numeroComprobante ?? null,
          tipoComprobante: cae?.tipoComprobante ?? tipoComprobante,
          sucursalId: usuario.sucursalId,
          usuarioId: usuario.id,
          terminalId: dto.terminalId ?? null,
          clienteId: dto.clienteId ?? null,
          items: { create: itemsData },
          ...(pagos.length > 0
            ? { pagos: { create: pagos.map((p) => ({ medioPago: p.medioPago, monto: new Decimal(p.monto) })) } }
            : {}),
        },
        include: {
          items: { include: { producto: { select: { id: true, nombre: true, codigo: true } } } },
          pagos: true,
        },
      });

      // La venta física ya ocurrió: registramos la salida de stock, sin
      // bloquear por stock insuficiente (control de negativo es informativo).
      // Combos ya expandidos y lotes ya asignados por FEFO (`tramosStock`).
      for (const t of tramosStock) {
        await tx.movimientoStock.create({
          data: {
            tipo: 'VENTA',
            cantidad: t.cantidad,
            motivo: `Venta ${dto.operacionId}`,
            productoId: t.productoId,
            sucursalId: usuario.sucursalId,
            ventaId: v.id,
            loteId: t.loteId,
          },
        });
      }

      // Fiado: cargamos la deuda a la cuenta corriente del cliente (sin chequear
      // el límite: la venta ya se hizo). El control de límite vive en el POS.
      if (montoCuentaCorriente.gt(0) && dto.clienteId) {
        await tx.movimientoCuentaCorriente.create({
          data: {
            tipo: 'CARGO',
            monto: montoCuentaCorriente,
            concepto: `Venta ${dto.operacionId}`,
            clienteId: dto.clienteId,
            sucursalId: usuario.sucursalId,
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

  /**
   * Convierte los movimientos de stock de una venta (ya expandidos de combos) en
   * tramos concretos: para un producto simple, un tramo sin lote; para un
   * perecedero, los lotes asignados por FEFO más —si los lotes no alcanzan— un
   * tramo sin lote por el sobrante (la venta ya ocurrió, no se pierde la salida).
   */
  private async planificarStockDeVenta(
    sucursalId: string,
    movimientos: ReadonlyArray<{ productoId: string; cantidad: Decimal }>,
  ): Promise<TramoStock[]> {
    const ids = [...new Set(movimientos.map((m) => m.productoId))];
    const productos =
      ids.length > 0
        ? await this.prisma.producto.findMany({
            where: { id: { in: ids } },
            select: { id: true, requiereLote: true },
          })
        : [];
    const requiereLote = new Map(productos.map((p) => [p.id, p.requiereLote]));

    const tramos: TramoStock[] = [];
    for (const m of movimientos) {
      if (!requiereLote.get(m.productoId)) {
        tramos.push({ productoId: m.productoId, cantidad: m.cantidad, loteId: null });
        continue;
      }
      const lotes = await this.saldosDeLotes(sucursalId, m.productoId);
      const { asignaciones, restante } = asignarFefo(lotes, m.cantidad);
      for (const a of asignaciones) {
        tramos.push({ productoId: m.productoId, cantidad: a.cantidad, loteId: a.loteId });
      }
      if (restante.gt(0)) {
        tramos.push({ productoId: m.productoId, cantidad: restante, loteId: null });
      }
    }
    return tramos;
  }

  /** Saldo por lote de un producto (ENTRADA/AJUSTE suman, SALIDA/VENTA restan). */
  private async saldosDeLotes(sucursalId: string, productoId: string): Promise<LoteConSaldo[]> {
    const lotes = await this.prisma.lote.findMany({
      where: { productoId, sucursalId },
      select: { id: true, fechaVencimiento: true },
    });
    if (lotes.length === 0) return [];
    const movs = await this.prisma.movimientoStock.findMany({
      where: { productoId, sucursalId, loteId: { not: null } },
      select: { loteId: true, tipo: true, cantidad: true },
    });
    const saldo = new Map<string, Decimal>();
    for (const l of lotes) saldo.set(l.id, new Decimal(0));
    for (const mv of movs) {
      if (mv.loteId === null) continue;
      const cur = saldo.get(mv.loteId);
      if (cur === undefined) continue;
      saldo.set(
        mv.loteId,
        mv.tipo === 'ENTRADA' || mv.tipo === 'AJUSTE' ? cur.add(mv.cantidad) : cur.sub(mv.cantidad),
      );
    }
    return lotes.map((l) => ({
      loteId: l.id,
      saldo: saldo.get(l.id) ?? new Decimal(0),
      fechaVencimiento: l.fechaVencimiento,
    }));
  }

  /** Mapa `comboId → componentes` para los productos dados que sean combos. */
  private async componentesDeCombos(
    productoIds: readonly string[],
  ): Promise<Map<string, ComponenteCombo[]>> {
    const unicos = [...new Set(productoIds)];
    const filas = await this.prisma.comboComponente.findMany({
      where: { comboId: { in: unicos } },
    });
    const mapa = new Map<string, ComponenteCombo[]>();
    for (const f of filas) {
      const lista = mapa.get(f.comboId) ?? [];
      lista.push({ componenteId: f.componenteId, cantidad: f.cantidad });
      mapa.set(f.comboId, lista);
    }
    return mapa;
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

/** Medio de pago resumen de una venta: el único medio, o COMBINADO, o el fallback. */
export function resumenMedioPago(
  pagos: ReadonlyArray<{ medioPago: MedioPago }>,
  fallback: MedioPago,
): MedioPago {
  if (pagos.length === 0) return fallback;
  const medios = new Set(pagos.map((p) => p.medioPago));
  return medios.size === 1 ? [...medios][0]! : MedioPago.COMBINADO;
}

/** Tipo de Nota de Crédito que corresponde a un comprobante (hereda la letra). */
export function notaCreditoDe(tipoComprobante: string | null): string {
  // Fase 10.1: un ticket sin valor fiscal no tiene Nota de Crédito — anular
  // refleja el mismo tipo (ver `esComprobanteFiscal`).
  if (tipoComprobante === 'TicketNoFiscal') return 'TicketNoFiscal';
  if (tipoComprobante?.startsWith('Factura')) {
    return tipoComprobante.replace('Factura', 'NotaCredito');
  }
  return 'NotaCreditoB';
}

/** ¿El tipo de comprobante requiere CAE de ARCA? (Fase 10.1: TicketNoFiscal no.) */
export function esComprobanteFiscal(tipoComprobante: string): boolean {
  return tipoComprobante !== 'TicketNoFiscal';
}
