import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type {
  DestinoDeRespaldo,
  MetadatosRespaldo,
} from './puertos/destino-de-respaldo';

/** Versión del formato de snapshot. Subir si cambia la estructura. */
const VERSION_SNAPSHOT = '1';

/**
 * Tablas incluidas en el respaldo, en orden de inserción (respeta las FKs).
 * Los `refresh_tokens` se excluyen a propósito: son tokens de sesión efímeros,
 * no datos de negocio, y restaurarlos sería un riesgo de seguridad.
 */
interface SnapshotTablas {
  sucursales: unknown[];
  categorias: unknown[];
  usuarios: unknown[];
  productos: unknown[];
  ventas: unknown[];
  itemsVenta: unknown[];
  movimientosStock: unknown[];
}

interface Snapshot {
  version: string;
  generadoEn: string;
  /** sha256 de la serialización de `tablas`, para verificar integridad. */
  checksum: string;
  tablas: SnapshotTablas;
}

export class MotorDeRespaldo {
  private readonly logger = new Logger(MotorDeRespaldo.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly destino: DestinoDeRespaldo,
    /** Cantidad de respaldos a conservar (los más viejos se eliminan). */
    private readonly retener = 7,
  ) {}

  /**
   * Genera un snapshot consistente, lo comprime y lo entrega al destino.
   * Devuelve los metadatos del respaldo creado.
   */
  async crearRespaldo(): Promise<MetadatosRespaldo> {
    const snapshot = await this.generarSnapshot();
    const json = Buffer.from(JSON.stringify(snapshot), 'utf-8');
    const contenido = gzipSync(json);

    const nombre = `nexosoft-${new Date().toISOString().replace(/[:.]/g, '-')}.json.gz`;
    await this.destino.escribir(nombre, contenido);

    this.logger.log(`Respaldo creado: ${nombre} (${contenido.byteLength} bytes)`);

    await this.aplicarRetencion();

    return { nombre, creadoEn: new Date(), tamanoBytes: contenido.byteLength };
  }

  listarRespaldos(): Promise<MetadatosRespaldo[]> {
    return this.destino.listar();
  }

  /**
   * Restaura la base desde un respaldo. **Operación destructiva**: reemplaza
   * todos los datos. No se expone por HTTP; se invoca desde administración.
   */
  async restaurar(nombre: string): Promise<void> {
    const contenido = await this.destino.leer(nombre);
    const snapshot = JSON.parse(gunzipSync(contenido).toString('utf-8')) as Snapshot;

    if (snapshot.version !== VERSION_SNAPSHOT) {
      throw new Error(
        `Versión de snapshot incompatible: ${snapshot.version} (esperada ${VERSION_SNAPSHOT})`,
      );
    }

    const checksumActual = this.calcularChecksum(snapshot.tablas);
    if (checksumActual !== snapshot.checksum) {
      throw new Error('El respaldo está corrupto: el checksum no coincide');
    }

    const t = snapshot.tablas;

    await this.prisma.$transaction(async (tx) => {
      // Borrado en orden inverso de dependencias
      await tx.refreshToken.deleteMany();
      await tx.movimientoStock.deleteMany();
      await tx.itemVenta.deleteMany();
      await tx.venta.deleteMany();
      await tx.producto.deleteMany();
      await tx.usuario.deleteMany();
      await tx.categoria.deleteMany();
      await tx.sucursal.deleteMany();

      // Inserción en orden de dependencias
      await tx.sucursal.createMany({ data: t.sucursales as Prisma.SucursalCreateManyInput[] });
      await tx.categoria.createMany({ data: t.categorias as Prisma.CategoriaCreateManyInput[] });
      await tx.usuario.createMany({ data: t.usuarios as Prisma.UsuarioCreateManyInput[] });
      await tx.producto.createMany({ data: t.productos as Prisma.ProductoCreateManyInput[] });
      await tx.venta.createMany({ data: t.ventas as Prisma.VentaCreateManyInput[] });
      await tx.itemVenta.createMany({ data: t.itemsVenta as Prisma.ItemVentaCreateManyInput[] });
      await tx.movimientoStock.createMany({
        data: t.movimientosStock as Prisma.MovimientoStockCreateManyInput[],
      });
    });

    this.logger.warn(`Base restaurada desde ${nombre}`);
  }

  private async generarSnapshot(): Promise<Snapshot> {
    // Lectura consistente: todas las tablas dentro de una transacción.
    const [sucursales, categorias, usuarios, productos, ventas, itemsVenta, movimientosStock] =
      await this.prisma.$transaction([
        this.prisma.sucursal.findMany(),
        this.prisma.categoria.findMany(),
        this.prisma.usuario.findMany(),
        this.prisma.producto.findMany(),
        this.prisma.venta.findMany(),
        this.prisma.itemVenta.findMany(),
        this.prisma.movimientoStock.findMany(),
      ]);

    const tablas: SnapshotTablas = {
      sucursales,
      categorias,
      usuarios,
      productos,
      ventas,
      itemsVenta,
      movimientosStock,
    };

    return {
      version: VERSION_SNAPSHOT,
      generadoEn: new Date().toISOString(),
      checksum: this.calcularChecksum(tablas),
      tablas,
    };
  }

  private calcularChecksum(tablas: SnapshotTablas): string {
    return createHash('sha256').update(JSON.stringify(tablas)).digest('hex');
  }

  /** Elimina los respaldos que exceden la política de retención. */
  private async aplicarRetencion(): Promise<void> {
    if (this.retener <= 0) return;

    const respaldos = await this.destino.listar(); // del más nuevo al más viejo
    const sobrantes = respaldos.slice(this.retener);

    for (const r of sobrantes) {
      await this.destino.eliminar(r.nombre);
      this.logger.log(`Respaldo viejo eliminado por retención: ${r.nombre}`);
    }
  }
}
