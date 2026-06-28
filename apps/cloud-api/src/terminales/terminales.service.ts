import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CrearTerminalDto } from './dto/crear-terminal.dto';

/**
 * Terminales (cajas) de una sucursal. El POS las lista para que el cajero elija
 * en qué caja está; el `id` elegido viaja como `terminalId` en cada venta (FK).
 */
@Injectable()
export class TerminalesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lista las terminales activas de la sucursal (orden alfabético). */
  listar(sucursalId: string) {
    return this.prisma.terminal.findMany({
      where: { sucursalId, activa: true },
      orderBy: { nombre: 'asc' },
    });
  }

  /** Da de alta una terminal en la sucursal. */
  crear(sucursalId: string, dto: CrearTerminalDto) {
    return this.prisma.terminal.create({
      data: { nombre: dto.nombre, sucursalId },
    });
  }
}
