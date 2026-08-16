import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CrearProveedorDto } from './dto/crear-proveedor.dto';
import type { ActualizarProveedorDto } from './dto/actualizar-proveedor.dto';

/**
 * Proveedores (Fase 12). ABM simple: sin cuenta corriente ni condición de
 * IVA (a diferencia de Clientes, ADR-0027) — solo datos de contacto.
 */
@Injectable()
export class ProveedoresService {
  constructor(private readonly prisma: PrismaService) {}

  async listarProveedores(sucursalId: string, soloActivos = true) {
    return this.prisma.proveedor.findMany({
      where: { sucursalId, ...(soloActivos ? { activo: true } : {}) },
      orderBy: { nombre: 'asc' },
    });
  }

  async obtenerProveedor(sucursalId: string, id: string) {
    const proveedor = await this.prisma.proveedor.findFirst({ where: { id, sucursalId } });
    if (!proveedor) throw new NotFoundException(`Proveedor ${id} no encontrado`);
    return proveedor;
  }

  async crearProveedor(sucursalId: string, dto: CrearProveedorDto) {
    return this.prisma.proveedor.create({
      data: {
        nombre: dto.nombre,
        cuit: dto.cuit ?? null,
        contacto: dto.contacto ?? null,
        email: dto.email ?? null,
        telefono: dto.telefono ?? null,
        direccion: dto.direccion ?? null,
        sucursalId,
      },
    });
  }

  async actualizarProveedor(sucursalId: string, id: string, dto: ActualizarProveedorDto) {
    await this.obtenerProveedor(sucursalId, id);
    return this.prisma.proveedor.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined && { nombre: dto.nombre }),
        ...(dto.cuit !== undefined && { cuit: dto.cuit }),
        ...(dto.contacto !== undefined && { contacto: dto.contacto }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.telefono !== undefined && { telefono: dto.telefono }),
        ...(dto.direccion !== undefined && { direccion: dto.direccion }),
        ...(dto.activo !== undefined && { activo: dto.activo }),
      },
    });
  }

  async desactivarProveedor(sucursalId: string, id: string) {
    await this.obtenerProveedor(sucursalId, id);
    return this.prisma.proveedor.update({ where: { id }, data: { activo: false } });
  }
}
