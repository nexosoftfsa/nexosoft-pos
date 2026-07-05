import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { VentasService } from '../ventas/ventas.service';
import type { CrearPresupuestoDto } from './dto/crear-presupuesto.dto';

/** Usuario que ejecuta la conversión (para atribuir la venta generada). */
interface UsuarioCtx {
  id: string;
  email: string;
  sucursalId: string;
}

/**
 * Presupuestos: comprobante NO fiscal (sin CAE). Se arma con ítems y total, tiene
 * una validez en días y un estado (VIGENTE/CONVERTIDO/ANULADO). Ver ADR-0031.
 * Convertir un presupuesto vigente genera una **venta real** (ADR-0035).
 */
@Injectable()
export class PresupuestosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ventas: VentasService,
  ) {}

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

  /**
   * Convierte un presupuesto vigente en una **venta real**: genera la venta
   * (descuenta stock —incluye combos y lotes FEFO—, emite comprobante con CAE
   * mock, registra en el libro) reusando `VentasService.registrar`, y marca el
   * presupuesto CONVERTIDO. Todos los ítems deben referenciar un producto del
   * catálogo (las líneas libres no mueven stock). Ver ADR-0035.
   */
  async convertir(usuario: UsuarioCtx, id: string) {
    const p = await this.obtener(usuario.sucursalId, id);
    if (p.estado !== 'VIGENTE') {
      throw new BadRequestException(`El presupuesto ya está ${p.estado.toLowerCase()}`);
    }
    if (p.items.length === 0) {
      throw new BadRequestException('El presupuesto no tiene ítems para convertir.');
    }
    const sinProducto = p.items.filter((it) => it.productoId === null);
    if (sinProducto.length > 0) {
      throw new BadRequestException(
        'No se puede convertir: hay ítems sin producto del catálogo (líneas libres).',
      );
    }

    const venta = await this.ventas.registrar(usuario, {
      operacionId: `presup-${p.id}`,
      medioPago: 'EFECTIVO',
      items: p.items.map((it) => ({
        productoId: it.productoId as string,
        cantidad: it.cantidad.toString(),
        precioUnitario: it.precioUnitario.toString(),
      })),
    });

    const presupuesto = await this.prisma.presupuesto.update({
      where: { id },
      data: { estado: 'CONVERTIDO' },
      include: { items: true },
    });
    return { presupuesto, venta };
  }

  async anular(sucursalId: string, id: string) {
    const p = await this.obtener(sucursalId, id);
    if (p.estado !== 'VIGENTE') {
      throw new BadRequestException(`El presupuesto ya está ${p.estado.toLowerCase()}`);
    }
    return this.prisma.presupuesto.update({
      where: { id },
      data: { estado: 'ANULADO' },
      include: { items: true },
    });
  }
}
