import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import type { CrearPresupuestoDto } from './dto/crear-presupuesto.dto';

/**
 * Presupuestos: comprobante NO fiscal (sin CAE). Se arma con ítems y total, tiene
 * una validez en días y un estado (VIGENTE/CONVERTIDO/ANULADO). Ver ADR-0031.
 */
@Injectable()
export class PresupuestosService {
  constructor(private readonly prisma: PrismaService) {}

  listar(sucursalId: string) {
    return this.prisma.presupuesto.findMany({
      where: { sucursalId },
      orderBy: { creadoEn: 'desc' },
      include: { items: true },
    });
  }

  async obtener(sucursalId: string, id: string) {
    const p = await this.prisma.presupuesto.findFirst({
      where: { id, sucursalId },
      include: { items: true },
    });
    if (!p) throw new NotFoundException(`Presupuesto ${id} no encontrado`);
    return p;
  }

  async crear(sucursalId: string, dto: CrearPresupuestoDto) {
    let total = new Decimal(0);
    const items = dto.items.map((it) => {
      const subtotal = new Decimal(it.cantidad).mul(new Decimal(it.precioUnitario));
      total = total.add(subtotal);
      return {
        descripcion: it.descripcion,
        cantidad: new Decimal(it.cantidad),
        precioUnitario: new Decimal(it.precioUnitario),
        subtotal,
        productoId: it.productoId ?? null,
      };
    });

    const ultimo = await this.prisma.presupuesto.findFirst({
      where: { sucursalId },
      orderBy: { numero: 'desc' },
      select: { numero: true },
    });

    return this.prisma.presupuesto.create({
      data: {
        numero: (ultimo?.numero ?? 0) + 1,
        clienteNombre: dto.clienteNombre ?? null,
        observaciones: dto.observaciones ?? null,
        validezDias: dto.validezDias ?? 15,
        total,
        sucursalId,
        items: { create: items },
      },
      include: { items: true },
    });
  }

  async convertir(sucursalId: string, id: string) {
    return this.cambiarEstado(sucursalId, id, 'CONVERTIDO');
  }

  async anular(sucursalId: string, id: string) {
    return this.cambiarEstado(sucursalId, id, 'ANULADO');
  }

  private async cambiarEstado(sucursalId: string, id: string, estado: 'CONVERTIDO' | 'ANULADO') {
    const p = await this.obtener(sucursalId, id);
    if (p.estado !== 'VIGENTE') {
      throw new BadRequestException(`El presupuesto ya está ${p.estado.toLowerCase()}`);
    }
    return this.prisma.presupuesto.update({
      where: { id },
      data: { estado },
      include: { items: true },
    });
  }
}
