import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import type { RegistrarMovimientoDto } from './dto/registrar-movimiento.dto';

@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  async saldoPorProducto(sucursalId: string, productoId: string) {
    const producto = await this.prisma.producto.findFirst({
      where: { id: productoId, sucursalId },
      select: { id: true, nombre: true, codigo: true },
    });
    if (!producto) throw new NotFoundException(`Producto ${productoId} no encontrado`);

    const saldo = await this.calcularSaldo(productoId, sucursalId);
    return { producto, saldo: saldo.toString() };
  }

  async saldosTodos(sucursalId: string) {
    const productos = await this.prisma.producto.findMany({
      where: { sucursalId, activo: true },
      select: { id: true, nombre: true, codigo: true },
    });

    const saldos = await Promise.all(
      productos.map(async (p) => {
        const saldo = await this.calcularSaldo(p.id, sucursalId);
        return { producto: p, saldo: saldo.toString() };
      }),
    );

    return saldos;
  }

  async registrarMovimiento(sucursalId: string, dto: RegistrarMovimientoDto) {
    const producto = await this.prisma.producto.findFirst({
      where: { id: dto.productoId, sucursalId },
    });
    if (!producto) throw new NotFoundException(`Producto ${dto.productoId} no encontrado`);

    const cantidad = new Decimal(dto.cantidad);
    if (cantidad.lte(0)) throw new BadRequestException('La cantidad debe ser mayor a cero');

    // Para salidas/ventas verificar que haya stock suficiente
    if (dto.tipo === 'SALIDA' || dto.tipo === 'VENTA') {
      const saldoActual = await this.calcularSaldo(dto.productoId, sucursalId);
      if (saldoActual.lt(cantidad)) {
        throw new BadRequestException(
          `Stock insuficiente. Disponible: ${saldoActual.toString()}, solicitado: ${cantidad.toString()}`,
        );
      }
    }

    return this.prisma.movimientoStock.create({
      data: {
        tipo: dto.tipo,
        cantidad,
        motivo: dto.motivo ?? null,
        productoId: dto.productoId,
        sucursalId,
      },
      include: {
        producto: { select: { id: true, nombre: true, codigo: true } },
      },
    });
  }

  async historialProducto(sucursalId: string, productoId: string) {
    const producto = await this.prisma.producto.findFirst({
      where: { id: productoId, sucursalId },
      select: { id: true },
    });
    if (!producto) throw new NotFoundException(`Producto ${productoId} no encontrado`);

    return this.prisma.movimientoStock.findMany({
      where: { productoId, sucursalId },
      orderBy: { creadoEn: 'desc' },
      include: { producto: { select: { id: true, nombre: true, codigo: true } } },
    });
  }

  private async calcularSaldo(productoId: string, sucursalId: string): Promise<Decimal> {
    const movimientos = await this.prisma.movimientoStock.findMany({
      where: { productoId, sucursalId },
      select: { tipo: true, cantidad: true },
    });

    return movimientos.reduce((acc, mov) => {
      if (mov.tipo === 'ENTRADA' || mov.tipo === 'AJUSTE') {
        return acc.add(mov.cantidad);
      }
      return acc.sub(mov.cantidad);
    }, new Decimal(0));
  }
}
