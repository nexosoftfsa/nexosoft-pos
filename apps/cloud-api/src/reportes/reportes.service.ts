import { Injectable, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import type { RangoFechasDto } from './dto/rango-fechas.dto';

/** Días hacia atrás que cubre un reporte cuando no se indica rango. */
const DIAS_POR_DEFECTO = 30;
/**
 * Huso horario del comercio: Argentina (UTC-3, sin horario de verano desde 2009).
 * Los reportes agrupan y filtran por el DÍA LOCAL, no por UTC: si no, una venta de
 * la noche (que en UTC cae al día siguiente) quedaría en el día equivocado o fuera
 * de un filtro "hasta hoy".
 */
const OFFSET_AR = '-03:00';
const OFFSET_AR_MS = 3 * 60 * 60 * 1000;
/** Solo las ventas COMPLETADA cuentan para los reportes (se excluyen ANULADA/PENDIENTE). */
const ESTADO_VALIDO = 'COMPLETADA' as const;
const TOP_POR_DEFECTO = 10;
const UMBRAL_STOCK_POR_DEFECTO = 5;

/**
 * Reportes agregados para el panel del dueño. Solo lectura.
 *
 * Estrategia de agregación: se traen las ventas/items del rango (con un `select`
 * acotado) y se agregan en memoria con `Decimal` para mantener dinero exacto,
 * igual que el resto del backend. Es consistente con `StockService` y simple de
 * testear; para volúmenes muy grandes convendría mover la agregación a SQL
 * (`groupBy`/vistas), pero para una sucursal del MVP alcanza de sobra.
 */
@Injectable()
export class ReportesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** KPIs del período: total vendido, cantidad de ventas, ticket promedio, descuentos. */
  async resumenVentas(sucursalId: string, rango: RangoFechasDto) {
    const { gte, lt } = this.calcularRango(rango);
    const ventas = await this.prisma.venta.findMany({
      where: { sucursalId, estado: ESTADO_VALIDO, creadaEn: { gte, lt } },
      select: { total: true, descuento: true },
    });

    const totalVendido = ventas.reduce((a, v) => a.add(v.total), new Decimal(0));
    const totalDescuentos = ventas.reduce((a, v) => a.add(v.descuento), new Decimal(0));
    const cantidadVentas = ventas.length;
    const ticketPromedio =
      cantidadVentas === 0 ? new Decimal(0) : totalVendido.div(cantidadVentas);

    return {
      desde: gte.toISOString(),
      hasta: lt.toISOString(),
      cantidadVentas,
      totalVendido: totalVendido.toFixed(2),
      totalDescuentos: totalDescuentos.toFixed(2),
      ticketPromedio: ticketPromedio.toFixed(2),
    };
  }

  /** Serie temporal diaria (una fila por día con venta) para graficar la evolución. */
  async serieDiaria(sucursalId: string, rango: RangoFechasDto) {
    const { gte, lt } = this.calcularRango(rango);
    const ventas = await this.prisma.venta.findMany({
      where: { sucursalId, estado: ESTADO_VALIDO, creadaEn: { gte, lt } },
      select: { total: true, creadaEn: true },
      orderBy: { creadaEn: 'asc' },
    });

    const porDia = new Map<string, { total: Decimal; cantidad: number }>();
    for (const v of ventas) {
      const dia = this.diaLocal(v.creadaEn); // YYYY-MM-DD en hora Argentina
      const acc = porDia.get(dia) ?? { total: new Decimal(0), cantidad: 0 };
      acc.total = acc.total.add(v.total);
      acc.cantidad += 1;
      porDia.set(dia, acc);
    }

    return [...porDia.entries()].map(([fecha, { total, cantidad }]) => ({
      fecha,
      total: total.toFixed(2),
      cantidad,
    }));
  }

  /** Total y cantidad agrupados por medio de pago (para la torta del dashboard). */
  async porMedioPago(sucursalId: string, rango: RangoFechasDto) {
    const { gte, lt } = this.calcularRango(rango);
    const ventas = await this.prisma.venta.findMany({
      where: { sucursalId, estado: ESTADO_VALIDO, creadaEn: { gte, lt } },
      select: { total: true, medioPago: true },
    });

    const porMedio = new Map<string, { total: Decimal; cantidad: number }>();
    for (const v of ventas) {
      const acc = porMedio.get(v.medioPago) ?? { total: new Decimal(0), cantidad: 0 };
      acc.total = acc.total.add(v.total);
      acc.cantidad += 1;
      porMedio.set(v.medioPago, acc);
    }

    return [...porMedio.entries()]
      .map(([medioPago, { total, cantidad }]) => ({
        medioPago,
        total: total.toFixed(2),
        cantidad,
      }))
      .sort((a, b) => new Decimal(b.total).cmp(new Decimal(a.total)));
  }

  /** Total y cantidad por terminal (caja). Las ventas sin terminal se agrupan aparte. */
  async porTerminal(sucursalId: string, rango: RangoFechasDto) {
    const { gte, lt } = this.calcularRango(rango);
    const ventas = await this.prisma.venta.findMany({
      where: { sucursalId, estado: ESTADO_VALIDO, creadaEn: { gte, lt } },
      select: {
        total: true,
        terminalId: true,
        terminal: { select: { nombre: true } },
      },
    });

    const porTerminal = new Map<
      string,
      { nombre: string; total: Decimal; cantidad: number }
    >();
    for (const v of ventas) {
      const clave = v.terminalId ?? 'sin-terminal';
      const nombre = v.terminal?.nombre ?? 'Sin terminal';
      const acc = porTerminal.get(clave) ?? { nombre, total: new Decimal(0), cantidad: 0 };
      acc.total = acc.total.add(v.total);
      acc.cantidad += 1;
      porTerminal.set(clave, acc);
    }

    return [...porTerminal.entries()]
      .map(([terminalId, { nombre, total, cantidad }]) => ({
        terminalId,
        nombre,
        total: total.toFixed(2),
        cantidad,
      }))
      .sort((a, b) => new Decimal(b.total).cmp(new Decimal(a.total)));
  }

  /** Ranking de productos más vendidos del período (por cantidad). */
  async topProductos(sucursalId: string, rango: RangoFechasDto, limite = TOP_POR_DEFECTO) {
    const { gte, lt } = this.calcularRango(rango);
    const items = await this.prisma.itemVenta.findMany({
      where: {
        venta: { sucursalId, estado: ESTADO_VALIDO, creadaEn: { gte, lt } },
      },
      select: {
        cantidad: true,
        subtotal: true,
        productoId: true,
        producto: { select: { nombre: true, codigo: true } },
      },
    });

    const porProducto = new Map<
      string,
      { nombre: string; codigo: string; cantidad: Decimal; monto: Decimal }
    >();
    for (const it of items) {
      const acc =
        porProducto.get(it.productoId) ?? {
          nombre: it.producto.nombre,
          codigo: it.producto.codigo,
          cantidad: new Decimal(0),
          monto: new Decimal(0),
        };
      acc.cantidad = acc.cantidad.add(it.cantidad);
      acc.monto = acc.monto.add(it.subtotal);
      porProducto.set(it.productoId, acc);
    }

    return [...porProducto.entries()]
      .map(([productoId, v]) => ({
        productoId,
        nombre: v.nombre,
        codigo: v.codigo,
        cantidad: v.cantidad.toString(),
        monto: v.monto.toFixed(2),
      }))
      .sort((a, b) => new Decimal(b.cantidad).cmp(new Decimal(a.cantidad)))
      .slice(0, limite);
  }

  /**
   * Ganancia bruta del período: ventas − costo de lo vendido. El costo de cada
   * ítem es el snapshot tomado al momento de la venta (`costoUnitario`,
   * ADR-0048); si no está (ventas sincronizadas antes de esa migración), se usa
   * el costo ACTUAL del producto como aproximación documentada.
   */
  async rentabilidad(sucursalId: string, rango: RangoFechasDto) {
    const { gte, lt } = this.calcularRango(rango);
    const items = await this.prisma.itemVenta.findMany({
      where: {
        venta: { sucursalId, estado: ESTADO_VALIDO, creadaEn: { gte, lt } },
      },
      select: {
        cantidad: true,
        subtotal: true,
        costoUnitario: true,
        producto: { select: { precioCosto: true } },
      },
    });

    let ventasTotal = new Decimal(0);
    let costoTotal = new Decimal(0);
    for (const it of items) {
      const costoEfectivo = it.costoUnitario ?? it.producto.precioCosto;
      ventasTotal = ventasTotal.add(it.subtotal);
      costoTotal = costoTotal.add(it.cantidad.mul(costoEfectivo));
    }
    const gananciaBruta = ventasTotal.sub(costoTotal);

    return {
      ventasTotal: ventasTotal.toFixed(2),
      costoTotal: costoTotal.toFixed(2),
      gananciaBruta: gananciaBruta.toFixed(2),
    };
  }

  /** Productos activos cuyo saldo de stock está en o por debajo del umbral. */
  async stockBajo(sucursalId: string, umbral = UMBRAL_STOCK_POR_DEFECTO) {
    const productos = await this.prisma.producto.findMany({
      where: { sucursalId, activo: true },
      select: { id: true, nombre: true, codigo: true },
    });

    const limite = new Decimal(umbral);
    const bajos: { producto: (typeof productos)[number]; saldo: string }[] = [];

    for (const p of productos) {
      const movimientos = await this.prisma.movimientoStock.findMany({
        where: { productoId: p.id, sucursalId },
        select: { tipo: true, cantidad: true },
      });
      const saldo = movimientos.reduce(
        (acc, m) =>
          m.tipo === 'ENTRADA' || m.tipo === 'AJUSTE'
            ? acc.add(m.cantidad)
            : acc.sub(m.cantidad),
        new Decimal(0),
      );
      if (saldo.lte(limite)) bajos.push({ producto: p, saldo: saldo.toString() });
    }

    return bajos.sort((a, b) => new Decimal(a.saldo).cmp(new Decimal(b.saldo)));
  }

  /** Ruta del libro de ventas Excel (misma config que el `VentasModule`, ADR-0021). */
  rutaLibroVentas(): string {
    const carpeta = this.config.get<string>('RESPALDO_RUTA') ?? './respaldos';
    return (
      this.config.get<string>('LIBRO_VENTAS_ARCHIVO') ?? join(carpeta, 'ventas.xlsx')
    );
  }

  /** Lee el libro de ventas Excel. Lanza 404 si todavía no existe (sin ventas). */
  async abrirLibroDeVentas(): Promise<Buffer> {
    try {
      return await fs.readFile(this.rutaLibroVentas());
    } catch {
      throw new NotFoundException(
        'Todavía no hay libro de ventas (ninguna venta registrada).',
      );
    }
  }

  /**
   * Resuelve el rango efectivo. `desde`/`hasta` aceptan `YYYY-MM-DD` (día de
   * calendario) o `YYYY-MM-DDTHH:mm` (instante exacto), siempre en **hora
   * Argentina**. Sin componente de hora, `hasta` es INCLUSIVE (se suma un día
   * completo para el `lt`); con hora, `hasta` es el límite exacto elegido por
   * el usuario (sin sumar un día). Sin parámetros: los últimos
   * {@link DIAS_POR_DEFECTO} días hasta hoy (AR) inclusive.
   */
  private calcularRango(rango: RangoFechasDto): { gte: Date; lt: Date } {
    const hoy = this.diaLocal(new Date());
    const desde = rango.desde ?? this.sumarDias(hoy, -DIAS_POR_DEFECTO);
    const hasta = rango.hasta ?? hoy;

    const gte = this.aInstanteAr(desde);
    const lt = this.aInstanteAr(hasta);
    if (!hasta.includes('T')) {
      lt.setUTCDate(lt.getUTCDate() + 1); // hasta inclusive (día local completo)
    }

    return { gte, lt };
  }

  /**
   * Convierte `YYYY-MM-DD` o `YYYY-MM-DDTHH:mm[:ss]` (hora Argentina) al
   * instante UTC correspondiente. Sin hora, se toma la medianoche AR de ese día.
   */
  private aInstanteAr(valor: string): Date {
    const conHora = valor.includes('T') ? valor : `${valor}T00:00:00`;
    const conSegundos = /T\d{2}:\d{2}$/.test(conHora) ? `${conHora}:00` : conHora;
    return new Date(`${conSegundos}.000${OFFSET_AR}`);
  }

  /** Día de calendario en hora Argentina (UTC-3) de una fecha, como YYYY-MM-DD. */
  private diaLocal(fecha: Date): string {
    return new Date(fecha.getTime() - OFFSET_AR_MS).toISOString().slice(0, 10);
  }

  /** Suma (o resta) días a una fecha `YYYY-MM-DD` y devuelve el mismo formato. */
  private sumarDias(yyyymmdd: string, dias: number): string {
    const d = new Date(`${yyyymmdd}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
  }
}
