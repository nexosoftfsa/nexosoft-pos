import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { asignarFefo, type LoteConSaldo } from '../stock/fefo';
import type { CrearRemitoDto } from './dto/crear-remito.dto';

type Tx = Prisma.TransactionClient;

/**
 * Remitos: documento de entrega NO fiscal (sin precios ni CAE). Al **emitir** un
 * remito se descuenta el stock de sus ítems (SALIDA, con FEFO para perecederos);
 * al **anular** se restaura. Los movimientos se vinculan por `remitoId`. Ver
 * ADR-0032 y ADR-0036.
 */
@Injectable()
export class RemitosService {
  constructor(private readonly prisma: PrismaService) {}

  listar(sucursalId: string) {
    return this.prisma.remito.findMany({
      where: { sucursalId },
      orderBy: { creadoEn: 'desc' },
      include: { items: true },
    });
  }

  async obtener(sucursalId: string, id: string) {
    const r = await this.prisma.remito.findFirst({
      where: { id, sucursalId },
      include: { items: true },
    });
    if (!r) throw new NotFoundException(`Remito ${id} no encontrado`);
    return r;
  }

  async crear(sucursalId: string, dto: CrearRemitoDto) {
    const ultimo = await this.prisma.remito.findFirst({
      where: { sucursalId },
      orderBy: { numero: 'desc' },
      select: { numero: true },
    });
    return this.prisma.$transaction(async (tx) => {
      const remito = await tx.remito.create({
        data: {
          numero: (ultimo?.numero ?? 0) + 1,
          clienteNombre: dto.clienteNombre ?? null,
          observaciones: dto.observaciones ?? null,
          sucursalId,
          items: {
            create: dto.items.map((it) => ({
              descripcion: it.descripcion,
              cantidad: new Decimal(it.cantidad),
              productoId: it.productoId ?? null,
            })),
          },
        },
        include: { items: true },
      });

      // La entrega saca mercadería: una SALIDA por ítem con producto (FEFO en
      // perecederos). No bloquea por stock insuficiente (el remito documenta lo
      // que se entregó); el sobrante que no cubren los lotes va sin lote.
      for (const it of remito.items) {
        if (it.productoId === null) continue;
        await this.descontar(tx, sucursalId, it.productoId, it.cantidad, remito.id, remito.numero);
      }
      return remito;
    });
  }

  async anular(sucursalId: string, id: string) {
    const r = await this.obtener(sucursalId, id);
    if (r.estado !== 'EMITIDO') throw new BadRequestException('El remito ya está anulado');
    return this.prisma.$transaction(async (tx) => {
      // La mercadería vuelve: espejamos las SALIDA reales del remito como ENTRADA
      // (al mismo lote, para perecederos).
      const salidas = await tx.movimientoStock.findMany({
        where: { remitoId: id, tipo: 'SALIDA' },
      });
      for (const m of salidas) {
        await tx.movimientoStock.create({
          data: {
            tipo: 'ENTRADA',
            cantidad: m.cantidad,
            motivo: `Anulación remito N° ${r.numero}`,
            productoId: m.productoId,
            sucursalId,
            loteId: m.loteId ?? null,
            remitoId: id,
          },
        });
      }
      return tx.remito.update({
        where: { id },
        data: { estado: 'ANULADO' },
        include: { items: true },
      });
    });
  }

  /** Crea la(s) SALIDA de un ítem: FEFO por lotes si es perecedero, o directa. */
  private async descontar(
    tx: Tx,
    sucursalId: string,
    productoId: string,
    cantidad: Decimal,
    remitoId: string,
    numero: number,
  ) {
    const motivo = `Remito N° ${numero}`;
    const producto = await tx.producto.findFirst({
      where: { id: productoId, sucursalId },
      select: { requiereLote: true },
    });
    if (!producto?.requiereLote) {
      await tx.movimientoStock.create({
        data: { tipo: 'SALIDA', cantidad, motivo, productoId, sucursalId, remitoId },
      });
      return;
    }
    const { asignaciones, restante } = asignarFefo(
      await this.saldosDeLotes(tx, sucursalId, productoId),
      cantidad,
    );
    for (const a of asignaciones) {
      await tx.movimientoStock.create({
        data: { tipo: 'SALIDA', cantidad: a.cantidad, motivo, productoId, sucursalId, loteId: a.loteId, remitoId },
      });
    }
    if (restante.gt(0)) {
      await tx.movimientoStock.create({
        data: { tipo: 'SALIDA', cantidad: restante, motivo, productoId, sucursalId, remitoId },
      });
    }
  }

  private async saldosDeLotes(tx: Tx, sucursalId: string, productoId: string): Promise<LoteConSaldo[]> {
    const lotes = await tx.lote.findMany({
      where: { productoId, sucursalId },
      select: { id: true, fechaVencimiento: true },
    });
    if (lotes.length === 0) return [];
    const movs = await tx.movimientoStock.findMany({
      where: { productoId, sucursalId, loteId: { not: null } },
      select: { loteId: true, tipo: true, cantidad: true },
    });
    const saldo = new Map<string, Decimal>();
    for (const l of lotes) saldo.set(l.id, new Decimal(0));
    for (const m of movs) {
      if (m.loteId === null) continue;
      const cur = saldo.get(m.loteId);
      if (cur === undefined) continue;
      saldo.set(
        m.loteId,
        m.tipo === 'ENTRADA' || m.tipo === 'AJUSTE' ? cur.add(m.cantidad) : cur.sub(m.cantidad),
      );
    }
    return lotes.map((l) => ({
      loteId: l.id,
      saldo: saldo.get(l.id) ?? new Decimal(0),
      fechaVencimiento: l.fechaVencimiento,
    }));
  }
}
