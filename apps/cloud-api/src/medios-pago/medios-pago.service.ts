import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CrearTarjetaDto } from './dto/crear-tarjeta.dto';
import type { ActualizarTarjetaDto } from './dto/actualizar-tarjeta.dto';

const INCLUDE_TASAS = { tasas: { orderBy: { cantidadCuotas: 'asc' as const } } };

/**
 * Medios de pago (Fase 12.E): tarjetas por banco con su tasa de recargo
 * según cantidad de cuotas. ABM simple, mismo criterio que Proveedores
 * (soft-delete, sin cuenta corriente). El set de tasas se reemplaza
 * completo en cada alta/edición (más simple que diffear fila por fila).
 */
@Injectable()
export class MediosPagoService {
  constructor(private readonly prisma: PrismaService) {}

  async listarTarjetas(sucursalId: string, soloActivas = true) {
    return this.prisma.tarjetaConfig.findMany({
      where: { sucursalId, ...(soloActivas ? { activo: true } : {}) },
      orderBy: { banco: 'asc' },
      include: INCLUDE_TASAS,
    });
  }

  async obtenerTarjeta(sucursalId: string, id: string) {
    const tarjeta = await this.prisma.tarjetaConfig.findFirst({
      where: { id, sucursalId },
      include: INCLUDE_TASAS,
    });
    if (!tarjeta) throw new NotFoundException(`Tarjeta ${id} no encontrada`);
    return tarjeta;
  }

  async crearTarjeta(sucursalId: string, dto: CrearTarjetaDto) {
    const tarjeta = await this.prisma.tarjetaConfig.create({
      data: {
        banco: dto.banco,
        tipo: dto.tipo,
        marca: dto.marca ?? null,
        sucursalId,
        tasas: { create: dto.tasas.map((t) => ({ ...t })) },
      },
      include: INCLUDE_TASAS,
    });
    return tarjeta;
  }

  async actualizarTarjeta(sucursalId: string, id: string, dto: ActualizarTarjetaDto) {
    await this.obtenerTarjeta(sucursalId, id);
    return this.prisma.$transaction(async (tx) => {
      await tx.tarjetaConfig.update({
        where: { id },
        data: {
          ...(dto.banco !== undefined && { banco: dto.banco }),
          ...(dto.tipo !== undefined && { tipo: dto.tipo }),
          ...(dto.marca !== undefined && { marca: dto.marca }),
          ...(dto.activo !== undefined && { activo: dto.activo }),
        },
      });
      if (dto.tasas !== undefined) {
        await tx.tasaCuota.deleteMany({ where: { tarjetaConfigId: id } });
        await tx.tasaCuota.createMany({
          data: dto.tasas.map((t) => ({ ...t, tarjetaConfigId: id })),
        });
      }
      return tx.tarjetaConfig.findUniqueOrThrow({ where: { id }, include: INCLUDE_TASAS });
    });
  }

  async desactivarTarjeta(sucursalId: string, id: string) {
    await this.obtenerTarjeta(sucursalId, id);
    return this.prisma.tarjetaConfig.update({
      where: { id },
      data: { activo: false },
      include: INCLUDE_TASAS,
    });
  }
}
