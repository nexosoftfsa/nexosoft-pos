import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CrearCategoriaDto } from './dto/crear-categoria.dto';
import type { CrearProductoDto } from './dto/crear-producto.dto';
import type { ActualizarProductoDto } from './dto/actualizar-producto.dto';
import type { ComboComponenteDto } from './dto/combo-componente.dto';

/** `include` estándar de un producto: categoría + componentes (si es combo). */
const INCLUDE_PRODUCTO = {
  categoria: { select: { id: true, nombre: true } },
  componentes: {
    include: { componente: { select: { id: true, codigo: true, nombre: true } } },
  },
} as const;

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
      include: INCLUDE_PRODUCTO,
      orderBy: { nombre: 'asc' },
    });
  }

  async buscarProducto(sucursalId: string, codigo: string) {
    const producto = await this.prisma.producto.findUnique({
      where: { codigo_sucursalId: { codigo, sucursalId } },
      include: INCLUDE_PRODUCTO,
    });
    if (!producto) throw new NotFoundException(`Producto con código ${codigo} no encontrado`);
    return producto;
  }

  async obtenerProducto(sucursalId: string, id: string) {
    const producto = await this.prisma.producto.findFirst({
      where: { id, sucursalId },
      include: INCLUDE_PRODUCTO,
    });
    if (!producto) throw new NotFoundException(`Producto ${id} no encontrado`);
    return producto;
  }

  async crearProducto(sucursalId: string, dto: CrearProductoDto) {
    const existe = await this.prisma.producto.findUnique({
      where: { codigo_sucursalId: { codigo: dto.codigo, sucursalId } },
    });
    if (existe) throw new ConflictException(`Ya existe un producto con código ${dto.codigo}`);

    const esCombo = dto.tipo === 'COMBO';
    const componentes = esCombo ? await this.validarComponentes(sucursalId, dto.componentes) : [];

    return this.prisma.producto.create({
      data: {
        codigo: dto.codigo,
        nombre: dto.nombre,
        descripcion: dto.descripcion ?? null,
        precioVenta: dto.precioVenta,
        precioCosto: dto.precioCosto,
        tipoIva: dto.tipoIva ?? 'IVA_21',
        tipo: esCombo ? 'COMBO' : 'SIMPLE',
        sucursalId,
        categoriaId: dto.categoriaId ?? null,
        ...(esCombo
          ? {
              componentes: {
                create: componentes.map((c) => ({
                  componenteId: c.componenteId,
                  cantidad: c.cantidad,
                })),
              },
            }
          : {}),
      },
      include: INCLUDE_PRODUCTO,
    });
  }

  async actualizarProducto(sucursalId: string, id: string, dto: ActualizarProductoDto) {
    const actual = await this.obtenerProducto(sucursalId, id);

    const datos = {
      ...(dto.nombre !== undefined && { nombre: dto.nombre }),
      ...(dto.descripcion !== undefined && { descripcion: dto.descripcion }),
      ...(dto.precioVenta !== undefined && { precioVenta: dto.precioVenta }),
      ...(dto.precioCosto !== undefined && { precioCosto: dto.precioCosto }),
      ...(dto.tipoIva !== undefined && { tipoIva: dto.tipoIva }),
      ...(dto.activo !== undefined && { activo: dto.activo }),
      ...(dto.categoriaId !== undefined && { categoriaId: dto.categoriaId }),
    };

    // Sin recambio de componentes: update directo (camino de producto simple).
    if (dto.componentes === undefined) {
      return this.prisma.producto.update({ where: { id }, data: datos, include: INCLUDE_PRODUCTO });
    }

    // Reemplazo del set de componentes: solo aplica a combos, en transacción.
    if (actual.tipo !== 'COMBO') {
      throw new BadRequestException('Solo un combo puede tener componentes.');
    }
    const recambio = await this.validarComponentes(sucursalId, dto.componentes, id);
    return this.prisma.$transaction(async (tx) => {
      await tx.comboComponente.deleteMany({ where: { comboId: id } });
      await tx.comboComponente.createMany({
        data: recambio.map((c) => ({
          comboId: id,
          componenteId: c.componenteId,
          cantidad: c.cantidad,
        })),
      });
      return tx.producto.update({ where: { id }, data: datos, include: INCLUDE_PRODUCTO });
    });
  }

  /**
   * Valida los componentes de un combo: al menos uno, cada uno existe en la
   * sucursal, es SIMPLE (no combos de combos), no se repite ni se referencia a
   * sí mismo, y la cantidad es positiva. Devuelve las cantidades como Decimal.
   */
  private async validarComponentes(
    sucursalId: string,
    componentes: readonly ComboComponenteDto[] | undefined,
    comboId?: string,
  ): Promise<Array<{ componenteId: string; cantidad: string }>> {
    if (!componentes || componentes.length === 0) {
      throw new BadRequestException('Un combo necesita al menos un componente.');
    }
    const ids = componentes.map((c) => c.componenteId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('El combo tiene componentes repetidos.');
    }
    if (comboId !== undefined && ids.includes(comboId)) {
      throw new BadRequestException('Un combo no puede contenerse a sí mismo.');
    }
    for (const c of componentes) {
      if (Number(c.cantidad) <= 0) {
        throw new BadRequestException('La cantidad de cada componente debe ser positiva.');
      }
    }
    const existentes = await this.prisma.producto.findMany({
      where: { id: { in: ids }, sucursalId },
      select: { id: true, tipo: true },
    });
    const porId = new Map(existentes.map((p) => [p.id, p]));
    for (const id of ids) {
      const p = porId.get(id);
      if (!p) throw new BadRequestException(`El componente ${id} no existe en la sucursal.`);
      if (p.tipo === 'COMBO') {
        throw new BadRequestException('Un combo no puede incluir otro combo como componente.');
      }
    }
    return componentes.map((c) => ({ componenteId: c.componenteId, cantidad: c.cantidad }));
  }

  async desactivarProducto(sucursalId: string, id: string) {
    await this.obtenerProducto(sucursalId, id);
    return this.prisma.producto.update({
      where: { id },
      data: { activo: false },
    });
  }
}
