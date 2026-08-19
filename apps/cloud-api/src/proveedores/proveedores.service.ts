import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CrearProveedorDto } from './dto/crear-proveedor.dto';
import type { ActualizarProveedorDto } from './dto/actualizar-proveedor.dto';
import { mapearFilaProveedorCruda, claveProveedor, type FilaProveedorCruda } from './importar-proveedores-lote';
import { RevertirDryRun, type ResultadoFilaImportacion } from '../common/importacion-lote';

type Tx = Prisma.TransactionClient;

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

  // ─── Importación masiva (Fase 14.C) ─────────────────────────────────────

  /**
   * Importa un lote de filas crudas de Excel. `Proveedor` no tiene ninguna
   * restricción de unicidad en el modelo (a diferencia de `Producto.codigo`),
   * así que la deduplicación es "manual": mismo nombre+CUIT ya existente en
   * la sucursal, o repetido dentro del propio lote, se omite (no se crea
   * dos veces). Mismo patrón de dry-run que `CatalogoService.importarProductos`.
   */
  async importarProveedores(
    sucursalId: string,
    filas: FilaProveedorCruda[],
    dryRun: boolean,
  ): Promise<ResultadoFilaImportacion[]> {
    const procesarLote = async (tx: Tx): Promise<ResultadoFilaImportacion[]> => {
      const resultados: ResultadoFilaImportacion[] = [];
      const clavesExistentes = new Set(
        (await tx.proveedor.findMany({ where: { sucursalId }, select: { nombre: true, cuit: true } })).map((p) =>
          claveProveedor(p.nombre, p.cuit),
        ),
      );

      for (let i = 0; i < filas.length; i++) {
        const numeroFila = i + 2; // fila 1 = encabezado
        try {
          const proveedor = mapearFilaProveedorCruda(filas[i]!);
          const clave = claveProveedor(proveedor.nombre, proveedor.cuit);
          if (clavesExistentes.has(clave)) {
            resultados.push({
              fila: numeroFila,
              resultado: 'omitida',
              mensaje: `Ya existe (o se repite en el archivo) el proveedor "${proveedor.nombre}"`,
            });
            continue;
          }
          await tx.proveedor.create({ data: { ...proveedor, sucursalId } });
          clavesExistentes.add(clave);
          resultados.push({ fila: numeroFila, resultado: 'creada' });
        } catch (error) {
          resultados.push({ fila: numeroFila, resultado: 'error', mensaje: (error as Error).message });
        }
      }
      return resultados;
    };

    if (!dryRun) {
      return this.prisma.$transaction((tx) => procesarLote(tx), { timeout: 60_000 });
    }
    try {
      await this.prisma.$transaction(
        async (tx) => {
          const resultados = await procesarLote(tx);
          throw new RevertirDryRun(resultados);
        },
        { timeout: 60_000 },
      );
      /* istanbul ignore next -- inalcanzable: procesarLote siempre termina en RevertirDryRun arriba */
      return [];
    } catch (error) {
      if (error instanceof RevertirDryRun) return error.resultados;
      throw error;
    }
  }
}
