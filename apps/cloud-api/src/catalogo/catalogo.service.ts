import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CrearCategoriaDto } from './dto/crear-categoria.dto';
import type { CrearProductoDto } from './dto/crear-producto.dto';
import type { ActualizarProductoDto } from './dto/actualizar-producto.dto';

@Injectable()
export class CatalogoService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Categorías ──────────────────────────────────────────────────────────

  listarCategorias() {
    return this.prisma.categoria.findMany({
      orderBy: { nombre: 'asc' },
    });
  }

  async crearCategoria(dto: CrearCategoriaDto) {
    return this.prisma.categoria.create({ data: { nombre: dto.nombre } });
  }

  async eliminarCategoria(id: string) {
    await this.obtenerCategoria(id);
    return this.prisma.categoria.delete({ where: { id } });
  }

  private async obtenerCategoria(id: string) {
    const cat = await this.prisma.categoria.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException(`Categoría ${id} no encontrada`);
    return cat;
  }

  // ─── Productos ───────────────────────────────────────────────────────────

  listarProductos(sucursalId: string, soloActivos = true) {
    return this.prisma.producto.findMany({
      where: { sucursalId, ...(soloActivos ? { activo: true } : {}) },
      include: { categoria: { select: { id: true, nombre: true } } },
      orderBy: { nombre: 'asc' },
    });
  }

  async buscarProducto(sucursalId: string, codigo: string) {
    const producto = await this.prisma.producto.findUnique({
      where: { codigo_sucursalId: { codigo, sucursalId } },
      include: { categoria: { select: { id: true, nombre: true } } },
    });
    if (!producto) throw new NotFoundException(`Producto con código ${codigo} no encontrado`);
    return producto;
  }

  async obtenerProducto(sucursalId: string, id: string) {
    const producto = await this.prisma.producto.findFirst({
      where: { id, sucursalId },
      include: { categoria: { select: { id: true, nombre: true } } },
    });
    if (!producto) throw new NotFoundException(`Producto ${id} no encontrado`);
    return producto;
  }

  async crearProducto(sucursalId: string, dto: CrearProductoDto) {
    const existe = await this.prisma.producto.findUnique({
      where: { codigo_sucursalId: { codigo: dto.codigo, sucursalId } },
    });
    if (existe) throw new ConflictException(`Ya existe un producto con código ${dto.codigo}`);

    return this.prisma.producto.create({
      data: {
        codigo: dto.codigo,
        nombre: dto.nombre,
        descripcion: dto.descripcion,
        precioVenta: dto.precioVenta,
        precioCosto: dto.precioCosto,
        tipoIva: dto.tipoIva ?? 'IVA_21',
        sucursalId,
        categoriaId: dto.categoriaId,
      },
      include: { categoria: { select: { id: true, nombre: true } } },
    });
  }

  async actualizarProducto(sucursalId: string, id: string, dto: ActualizarProductoDto) {
    await this.obtenerProducto(sucursalId, id);

    return this.prisma.producto.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined && { nombre: dto.nombre }),
        ...(dto.descripcion !== undefined && { descripcion: dto.descripcion }),
        ...(dto.precioVenta !== undefined && { precioVenta: dto.precioVenta }),
        ...(dto.precioCosto !== undefined && { precioCosto: dto.precioCosto }),
        ...(dto.tipoIva !== undefined && { tipoIva: dto.tipoIva }),
        ...(dto.activo !== undefined && { activo: dto.activo }),
        ...(dto.categoriaId !== undefined && { categoriaId: dto.categoriaId }),
      },
      include: { categoria: { select: { id: true, nombre: true } } },
    });
  }

  async desactivarProducto(sucursalId: string, id: string) {
    await this.obtenerProducto(sucursalId, id);
    return this.prisma.producto.update({
      where: { id },
      data: { activo: false },
    });
  }
}
