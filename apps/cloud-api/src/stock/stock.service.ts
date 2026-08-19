import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { RegistrarMovimientoDto } from './dto/registrar-movimiento.dto';
import { asignarFefo } from './fefo';
import { mapearFilaStockCruda, type FilaStockCruda } from './importar-stock-lote';
import { RevertirDryRun, type ResultadoFilaImportacion } from '../common/importacion-lote';

type Tx = Prisma.TransactionClient;

const INCLUDE_MOV = {
  producto: { select: { id: true, nombre: true, codigo: true } },
} as const;

/** Un lote con su saldo (derivado de sus movimientos) y datos de vencimiento. */
interface LoteSaldo {
  loteId: string;
  numero: string | null;
  saldo: Decimal;
  fechaVencimiento: Date;
}

@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  async saldoPorProducto(sucursalId: string, productoId: string) {
    const producto = await this.prisma.producto.findFirst({
      where: { id: productoId, sucursalId },
      select: { id: true, nombre: true, codigo: true, requiereLote: true },
    });
    if (!producto) throw new NotFoundException(`Producto ${productoId} no encontrado`);

    const saldo = await this.calcularSaldo(productoId, sucursalId);
    return { producto, saldo: saldo.toString() };
  }

  async saldosTodos(sucursalId: string) {
    const productos = await this.prisma.producto.findMany({
      where: { sucursalId, activo: true },
      select: { id: true, nombre: true, codigo: true, requiereLote: true },
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

    // Productos con lote (Fase 8.2): la ENTRADA abre un lote con vencimiento; la
    // SALIDA consume lotes por FEFO. El AJUSTE se registra a nivel producto.
    if (producto.requiereLote && dto.tipo === 'ENTRADA') {
      return this.registrarEntradaConLote(sucursalId, dto, cantidad);
    }
    if (producto.requiereLote && dto.tipo === 'SALIDA') {
      return this.registrarSalidaFefo(sucursalId, dto, cantidad);
    }

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
      include: INCLUDE_MOV,
    });
  }

  private async registrarEntradaConLote(
    sucursalId: string,
    dto: RegistrarMovimientoDto,
    cantidad: Decimal,
  ) {
    if (!dto.fechaVencimiento) {
      throw new BadRequestException(
        'La ENTRADA de un producto con lote necesita una fecha de vencimiento.',
      );
    }
    const lote = await this.prisma.lote.create({
      data: {
        productoId: dto.productoId,
        sucursalId,
        fechaVencimiento: new Date(dto.fechaVencimiento),
        numero: dto.numeroLote ?? null,
      },
    });
    return this.prisma.movimientoStock.create({
      data: {
        tipo: 'ENTRADA',
        cantidad,
        motivo: dto.motivo ?? null,
        productoId: dto.productoId,
        sucursalId,
        loteId: lote.id,
      },
      include: INCLUDE_MOV,
    });
  }

  private async registrarSalidaFefo(
    sucursalId: string,
    dto: RegistrarMovimientoDto,
    cantidad: Decimal,
  ) {
    const lotes = await this.saldosDeLotes(dto.productoId, sucursalId);
    const { asignaciones, restante } = asignarFefo(lotes, cantidad);
    if (restante.gt(0)) {
      const disponible = cantidad.sub(restante);
      throw new BadRequestException(
        `Stock insuficiente en lotes. Disponible: ${disponible.toString()}, solicitado: ${cantidad.toString()}`,
      );
    }
    const creados = await this.prisma.$transaction(
      asignaciones.map((a) =>
        this.prisma.movimientoStock.create({
          data: {
            tipo: 'SALIDA',
            cantidad: a.cantidad,
            motivo: dto.motivo ?? null,
            productoId: dto.productoId,
            sucursalId,
            loteId: a.loteId,
          },
          include: INCLUDE_MOV,
        }),
      ),
    );
    // Devolvemos el primer tramo (la UI recarga saldos/lotes tras el movimiento).
    return creados[0];
  }

  /** Lotes de un producto con su saldo derivado de los movimientos (Fase 8.2). */
  async lotesDeProducto(sucursalId: string, productoId: string) {
    const producto = await this.prisma.producto.findFirst({
      where: { id: productoId, sucursalId },
      select: { id: true },
    });
    if (!producto) throw new NotFoundException(`Producto ${productoId} no encontrado`);

    const lotes = await this.saldosDeLotes(productoId, sucursalId);
    return lotes
      .sort((a, b) => a.fechaVencimiento.getTime() - b.fechaVencimiento.getTime())
      .map((l) => ({
        id: l.loteId,
        numero: l.numero,
        fechaVencimiento: l.fechaVencimiento,
        saldo: l.saldo.toString(),
      }));
  }

  /**
   * Alertas de vencimiento: lotes con saldo > 0 vencidos o que vencen dentro de
   * `dias` (default 30). Ordenados por vencimiento más próximo primero.
   */
  async vencimientos(sucursalId: string, dias = 30) {
    const productos = await this.prisma.producto.findMany({
      where: { sucursalId, requiereLote: true, activo: true },
      select: { id: true, nombre: true, codigo: true },
    });
    const ahora = Date.now();
    const limiteMs = dias * 86_400_000;
    const alertas: Array<{
      producto: { id: string; nombre: string; codigo: string };
      loteId: string;
      numero: string | null;
      fechaVencimiento: Date;
      saldo: string;
      diasParaVencer: number;
      vencido: boolean;
    }> = [];

    for (const p of productos) {
      const lotes = await this.saldosDeLotes(p.id, sucursalId);
      for (const l of lotes) {
        if (l.saldo.lte(0)) continue;
        const deltaMs = l.fechaVencimiento.getTime() - ahora;
        if (deltaMs > limiteMs) continue; // todavía lejos del vencimiento
        alertas.push({
          producto: p,
          loteId: l.loteId,
          numero: l.numero,
          fechaVencimiento: l.fechaVencimiento,
          saldo: l.saldo.toString(),
          diasParaVencer: Math.floor(deltaMs / 86_400_000),
          vencido: deltaMs < 0,
        });
      }
    }
    return alertas.sort(
      (a, b) => a.fechaVencimiento.getTime() - b.fechaVencimiento.getTime(),
    );
  }

  /** Saldo de cada lote de un producto (ENTRADA/AJUSTE suman, SALIDA/VENTA restan). */
  private async saldosDeLotes(productoId: string, sucursalId: string): Promise<LoteSaldo[]> {
    const lotes = await this.prisma.lote.findMany({
      where: { productoId, sucursalId },
      select: { id: true, numero: true, fechaVencimiento: true },
    });
    if (lotes.length === 0) return [];

    const movimientos = await this.prisma.movimientoStock.findMany({
      where: { productoId, sucursalId, loteId: { not: null } },
      select: { loteId: true, tipo: true, cantidad: true },
    });
    const saldoPorLote = new Map<string, Decimal>();
    for (const l of lotes) saldoPorLote.set(l.id, new Decimal(0));
    for (const m of movimientos) {
      if (m.loteId === null) continue;
      const actual = saldoPorLote.get(m.loteId);
      if (actual === undefined) continue;
      const delta =
        m.tipo === 'ENTRADA' || m.tipo === 'AJUSTE' ? m.cantidad : m.cantidad.neg();
      saldoPorLote.set(m.loteId, actual.add(delta));
    }
    return lotes.map((l) => ({
      loteId: l.id,
      numero: l.numero,
      saldo: saldoPorLote.get(l.id) ?? new Decimal(0),
      fechaVencimiento: l.fechaVencimiento,
    }));
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

  // ─── Importación masiva (Fase 14.D) ─────────────────────────────────────

  /**
   * Importa una carga inicial de existencias desde Excel: cada fila válida
   * se registra como un `MovimientoStock` tipo ENTRADA (siempre aditivo --
   * no hay "ya existía" para un movimiento de stock, es un evento, no una
   * entidad con identidad propia). Si el producto requiere lote (Fase 8.2),
   * la fila necesita fecha de vencimiento y se abre un `Lote` nuevo, mismo
   * criterio que `registrarMovimiento`/`registrarEntradaConLote`.
   */
  async importarStock(
    sucursalId: string,
    filas: FilaStockCruda[],
    dryRun: boolean,
  ): Promise<ResultadoFilaImportacion[]> {
    const procesarLote = async (tx: Tx): Promise<ResultadoFilaImportacion[]> => {
      const resultados: ResultadoFilaImportacion[] = [];

      for (let i = 0; i < filas.length; i++) {
        const numeroFila = i + 2; // fila 1 = encabezado
        try {
          const carga = mapearFilaStockCruda(filas[i]!);
          const producto = await tx.producto.findUnique({
            where: { codigo_sucursalId: { codigo: carga.codigo, sucursalId } },
            select: { id: true, requiereLote: true },
          });
          if (!producto) {
            resultados.push({
              fila: numeroFila,
              resultado: 'error',
              mensaje: `No existe ningún producto con código ${carga.codigo} en esta sucursal.`,
            });
            continue;
          }

          let loteId: string | null = null;
          if (producto.requiereLote) {
            if (!carga.fechaVencimiento) {
              resultados.push({
                fila: numeroFila,
                resultado: 'error',
                mensaje: `El producto ${carga.codigo} es perecedero: necesita "Fecha de vencimiento".`,
              });
              continue;
            }
            const fechaVencimiento = new Date(carga.fechaVencimiento);
            if (Number.isNaN(fechaVencimiento.getTime())) {
              resultados.push({
                fila: numeroFila,
                resultado: 'error',
                mensaje: `Fecha de vencimiento inválida para el código ${carga.codigo}: "${carga.fechaVencimiento}"`,
              });
              continue;
            }
            const lote = await tx.lote.create({
              data: { productoId: producto.id, sucursalId, fechaVencimiento },
            });
            loteId = lote.id;
          }

          await tx.movimientoStock.create({
            data: {
              tipo: 'ENTRADA',
              cantidad: carga.cantidad,
              motivo: carga.motivo,
              productoId: producto.id,
              sucursalId,
              loteId,
            },
          });
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
