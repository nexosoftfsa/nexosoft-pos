import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import type { CrearRemitoDto } from './dto/crear-remito.dto';

/**
 * Remitos: documento de entrega NO fiscal (sin precios ni CAE). Lista de ítems
 * entregados, con número correlativo y estado EMITIDO/ANULADO. Ver ADR-0032.
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
    return this.prisma.remito.create({
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
  }

  async anular(sucursalId: string, id: string) {
    const r = await this.obtener(sucursalId, id);
    if (r.estado !== 'EMITIDO') throw new BadRequestException('El remito ya está anulado');
    return this.prisma.remito.update({
      where: { id },
      data: { estado: 'ANULADO' },
      include: { items: true },
    });
  }
}
