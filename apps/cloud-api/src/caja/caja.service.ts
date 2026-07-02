import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import type { AbrirTurnoDto } from './dto/abrir-turno.dto';
import type { RegistrarMovimientoCajaDto } from './dto/registrar-movimiento-caja.dto';
import type { CerrarTurnoDto } from './dto/cerrar-turno.dto';

/**
 * Caja y tesorería (Fase 7.4). Un turno de caja se abre en una terminal con un
 * fondo, acumula movimientos manuales de efectivo (ingreso/egreso) y se cierra
 * con un arqueo (conteo físico). Las ventas en efectivo NO se duplican: el saldo
 * teórico se deriva de las `Venta` EFECTIVO de la terminal dentro de la ventana
 * del turno (ADR-0026). Solo puede haber un turno ABIERTO por terminal.
 */
@Injectable()
export class CajaService {
  constructor(private readonly prisma: PrismaService) {}

  async abrirTurno(sucursalId: string, usuarioId: string, dto: AbrirTurnoDto) {
    const terminal = await this.prisma.terminal.findFirst({
      where: { id: dto.terminalId, sucursalId },
    });
    if (!terminal) throw new NotFoundException(`Terminal ${dto.terminalId} no encontrada`);

    const abierto = await this.prisma.turnoCaja.findFirst({
      where: { terminalId: dto.terminalId, sucursalId, estado: 'ABIERTO' },
    });
    if (abierto) {
      throw new ConflictException('Ya hay un turno de caja abierto en esta terminal');
    }

    const fondo = new Decimal(dto.fondoApertura);
    if (fondo.lt(0)) throw new BadRequestException('El fondo de apertura no puede ser negativo');

    const turno = await this.prisma.turnoCaja.create({
      data: {
        fondoApertura: fondo,
        sucursalId,
        terminalId: dto.terminalId,
        usuarioId,
      },
    });
    return this.conResumen(turno);
  }

  /** Turno abierto de una terminal (con resumen), o null si no hay ninguno. */
  async turnoActual(sucursalId: string, terminalId: string) {
    const turno = await this.prisma.turnoCaja.findFirst({
      where: { terminalId, sucursalId, estado: 'ABIERTO' },
      include: { movimientos: { orderBy: { creadoEn: 'desc' } } },
    });
    return turno ? this.conResumen(turno) : null;
  }

  async obtenerTurno(sucursalId: string, id: string) {
    const turno = await this.prisma.turnoCaja.findFirst({
      where: { id, sucursalId },
      include: { movimientos: { orderBy: { creadoEn: 'desc' } } },
    });
    if (!turno) throw new NotFoundException(`Turno ${id} no encontrado`);
    return this.conResumen(turno);
  }

  async listarTurnos(sucursalId: string, limite = 30) {
    const turnos = await this.prisma.turnoCaja.findMany({
      where: { sucursalId },
      orderBy: { abiertoEn: 'desc' },
      take: Math.min(Math.max(limite, 1), 100),
    });
    return turnos;
  }

  async registrarMovimiento(sucursalId: string, turnoId: string, dto: RegistrarMovimientoCajaDto) {
    const turno = await this.turnoAbierto(sucursalId, turnoId);
    const monto = new Decimal(dto.monto);
    if (monto.lte(0)) throw new BadRequestException('El monto debe ser mayor a cero');

    await this.prisma.movimientoCaja.create({
      data: {
        tipo: dto.tipo,
        monto,
        concepto: dto.concepto ?? null,
        turnoCajaId: turno.id,
        sucursalId,
      },
    });
    return this.obtenerTurno(sucursalId, turnoId);
  }

  async cerrarTurno(sucursalId: string, turnoId: string, dto: CerrarTurnoDto) {
    const turno = await this.turnoAbierto(sucursalId, turnoId);
    const contado = new Decimal(dto.montoContado);
    if (contado.lt(0)) throw new BadRequestException('El monto contado no puede ser negativo');

    const resumen = await this.calcularResumen(turno);
    const diferencia = contado.minus(new Decimal(resumen.saldoTeorico));

    await this.prisma.turnoCaja.update({
      where: { id: turno.id },
      data: {
        estado: 'CERRADO',
        cerradoEn: new Date(),
        montoContado: contado,
        diferencia,
        observaciones: dto.observaciones ?? null,
      },
    });
    return this.obtenerTurno(sucursalId, turnoId);
  }

  private async turnoAbierto(sucursalId: string, turnoId: string) {
    const turno = await this.prisma.turnoCaja.findFirst({
      where: { id: turnoId, sucursalId },
    });
    if (!turno) throw new NotFoundException(`Turno ${turnoId} no encontrado`);
    if (turno.estado !== 'ABIERTO') {
      throw new BadRequestException('El turno ya está cerrado');
    }
    return turno;
  }

  /** Adjunta el resumen calculado (KPIs del turno) al turno. */
  private async conResumen<T extends { id: string }>(turno: T) {
    const completo = await this.prisma.turnoCaja.findUniqueOrThrow({
      where: { id: turno.id },
      include: { movimientos: { orderBy: { creadoEn: 'desc' } } },
    });
    return { ...completo, resumen: await this.calcularResumen(completo) };
  }

  /**
   * Calcula el resumen del turno: ventas en efectivo (derivadas de Venta),
   * ingresos/egresos manuales y saldo teórico esperado en caja.
   */
  private async calcularResumen(turno: {
    id: string;
    sucursalId: string;
    terminalId: string;
    fondoApertura: Decimal;
    abiertoEn: Date;
    cerradoEn: Date | null;
    montoContado: Decimal | null;
    diferencia: Decimal | null;
  }) {
    const hasta = turno.cerradoEn ?? new Date();

    const ventas = await this.prisma.venta.findMany({
      where: {
        sucursalId: turno.sucursalId,
        terminalId: turno.terminalId,
        medioPago: 'EFECTIVO',
        estado: { not: 'ANULADA' },
        creadaEn: { gte: turno.abiertoEn, lte: hasta },
      },
      select: { total: true },
    });
    const ventasEfectivo = ventas.reduce((acc, v) => acc.plus(v.total), new Decimal(0));

    const movimientos = await this.prisma.movimientoCaja.findMany({
      where: { turnoCajaId: turno.id },
      select: { tipo: true, monto: true },
    });
    let ingresos = new Decimal(0);
    let egresos = new Decimal(0);
    for (const m of movimientos) {
      if (m.tipo === 'INGRESO') ingresos = ingresos.plus(m.monto);
      else egresos = egresos.plus(m.monto);
    }

    const saldoTeorico = new Decimal(turno.fondoApertura)
      .plus(ventasEfectivo)
      .plus(ingresos)
      .minus(egresos);

    return {
      fondoApertura: new Decimal(turno.fondoApertura).toFixed(2),
      ventasEfectivo: ventasEfectivo.toFixed(2),
      cantidadVentas: ventas.length,
      ingresos: ingresos.toFixed(2),
      egresos: egresos.toFixed(2),
      saldoTeorico: saldoTeorico.toFixed(2),
      montoContado: turno.montoContado ? new Decimal(turno.montoContado).toFixed(2) : null,
      diferencia: turno.diferencia ? new Decimal(turno.diferencia).toFixed(2) : null,
    };
  }
}
