import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import type { CrearClienteDto } from './dto/crear-cliente.dto';
import type { ActualizarClienteDto } from './dto/actualizar-cliente.dto';
import type { RegistrarMovimientoCtaCteDto } from './dto/registrar-movimiento-ctacte.dto';

/**
 * Clientes y cuentas corrientes (Fase 7.5). La cuenta corriente es un ledger:
 * cada movimiento es un CARGO (deuda: venta a cuenta) o un PAGO (cobro). El
 * saldo = ΣCARGO − ΣPAGO (positivo = el cliente debe). Ver ADR-0027.
 */
@Injectable()
export class ClientesService {
  constructor(private readonly prisma: PrismaService) {}

  async listarClientes(sucursalId: string, soloActivos = true) {
    const clientes = await this.prisma.cliente.findMany({
      where: { sucursalId, ...(soloActivos ? { activo: true } : {}) },
      orderBy: { nombre: 'asc' },
    });
    return Promise.all(
      clientes.map(async (c) => ({ ...c, saldo: (await this.calcularSaldo(c.id, sucursalId)).toFixed(2) })),
    );
  }

  async obtenerCliente(sucursalId: string, id: string) {
    const cliente = await this.prisma.cliente.findFirst({ where: { id, sucursalId } });
    if (!cliente) throw new NotFoundException(`Cliente ${id} no encontrado`);
    return { ...cliente, saldo: (await this.calcularSaldo(id, sucursalId)).toFixed(2) };
  }

  async estadoDeCuenta(sucursalId: string, id: string) {
    const cliente = await this.obtenerCliente(sucursalId, id);
    const movimientos = await this.prisma.movimientoCuentaCorriente.findMany({
      where: { clienteId: id, sucursalId },
      orderBy: { creadoEn: 'desc' },
    });
    return { cliente, movimientos };
  }

  async crearCliente(sucursalId: string, dto: CrearClienteDto) {
    return this.prisma.cliente.create({
      data: {
        nombre: dto.nombre,
        documento: dto.documento ?? null,
        condicionIva: dto.condicionIva ?? 'CONSUMIDOR_FINAL',
        email: dto.email ?? null,
        telefono: dto.telefono ?? null,
        direccion: dto.direccion ?? null,
        limiteCredito: new Decimal(dto.limiteCredito ?? '0'),
        sucursalId,
      },
    });
  }

  async actualizarCliente(sucursalId: string, id: string, dto: ActualizarClienteDto) {
    await this.obtenerCliente(sucursalId, id);
    return this.prisma.cliente.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined && { nombre: dto.nombre }),
        ...(dto.documento !== undefined && { documento: dto.documento }),
        ...(dto.condicionIva !== undefined && { condicionIva: dto.condicionIva }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.telefono !== undefined && { telefono: dto.telefono }),
        ...(dto.direccion !== undefined && { direccion: dto.direccion }),
        ...(dto.limiteCredito !== undefined && { limiteCredito: new Decimal(dto.limiteCredito) }),
        ...(dto.activo !== undefined && { activo: dto.activo }),
      },
    });
  }

  async desactivarCliente(sucursalId: string, id: string) {
    await this.obtenerCliente(sucursalId, id);
    return this.prisma.cliente.update({ where: { id }, data: { activo: false } });
  }

  /** Registra un CARGO (venta a cuenta). Respeta el límite de crédito si hay uno. */
  async registrarCargo(sucursalId: string, id: string, dto: RegistrarMovimientoCtaCteDto) {
    const cliente = await this.prisma.cliente.findFirst({ where: { id, sucursalId } });
    if (!cliente) throw new NotFoundException(`Cliente ${id} no encontrado`);

    const monto = new Decimal(dto.monto);
    if (monto.lte(0)) throw new BadRequestException('El monto debe ser mayor a cero');

    const limite = new Decimal(cliente.limiteCredito);
    if (limite.gt(0)) {
      const saldo = await this.calcularSaldo(id, sucursalId);
      if (saldo.plus(monto).gt(limite)) {
        throw new ConflictException(
          `El cargo supera el límite de crédito (límite ${limite.toFixed(2)}, saldo ${saldo.toFixed(2)})`,
        );
      }
    }
    return this.crearMovimiento(sucursalId, id, 'CARGO', monto, dto.concepto);
  }

  /** Registra un PAGO (cobro). */
  async registrarPago(sucursalId: string, id: string, dto: RegistrarMovimientoCtaCteDto) {
    await this.obtenerCliente(sucursalId, id);
    const monto = new Decimal(dto.monto);
    if (monto.lte(0)) throw new BadRequestException('El monto debe ser mayor a cero');
    return this.crearMovimiento(sucursalId, id, 'PAGO', monto, dto.concepto);
  }

  private async crearMovimiento(
    sucursalId: string,
    clienteId: string,
    tipo: 'CARGO' | 'PAGO',
    monto: Decimal,
    concepto: string | undefined,
  ) {
    await this.prisma.movimientoCuentaCorriente.create({
      data: { tipo, monto, concepto: concepto ?? null, clienteId, sucursalId },
    });
    return this.obtenerCliente(sucursalId, clienteId);
  }

  private async calcularSaldo(clienteId: string, sucursalId: string): Promise<Decimal> {
    const movimientos = await this.prisma.movimientoCuentaCorriente.findMany({
      where: { clienteId, sucursalId },
      select: { tipo: true, monto: true },
    });
    return movimientos.reduce(
      (acc, m) => (m.tipo === 'CARGO' ? acc.plus(m.monto) : acc.minus(m.monto)),
      new Decimal(0),
    );
  }
}
