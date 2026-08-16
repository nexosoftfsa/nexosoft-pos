import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { CajaService } from './caja.service';

const mockTurno = {
  findFirst: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
};
const mockMovimiento = { findMany: vi.fn(), create: vi.fn() };
const mockVenta = { findMany: vi.fn() };
const mockTerminal = { findFirst: vi.fn() };
const mockPrisma = {
  turnoCaja: mockTurno,
  movimientoCaja: mockMovimiento,
  venta: mockVenta,
  terminal: mockTerminal,
};

const SUCURSAL = 's1';
const TERMINAL = 't-caja1';
const USUARIO = 'u1';

function turnoAbierto(overrides: Record<string, unknown> = {}) {
  return {
    id: 'turno1',
    estado: 'ABIERTO',
    sucursalId: SUCURSAL,
    terminalId: TERMINAL,
    fondoApertura: new Decimal('1000'),
    abiertoEn: new Date('2026-07-02T12:00:00Z'),
    cerradoEn: null,
    montoContado: null,
    diferencia: null,
    movimientos: [],
    ...overrides,
  };
}

describe('CajaService', () => {
  let service: CajaService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CajaService(mockPrisma as never);
  });

  describe('abrirTurno', () => {
    it('lanza ConflictException si ya hay un turno abierto en la terminal', async () => {
      mockTerminal.findFirst.mockResolvedValue({ id: TERMINAL });
      mockTurno.findFirst.mockResolvedValue(turnoAbierto());
      await expect(
        service.abrirTurno(SUCURSAL, USUARIO, { terminalId: TERMINAL, fondoApertura: '1000' }),
      ).rejects.toThrow(ConflictException);
    });

    it('abre el turno y devuelve el resumen con el saldo teorico = fondo', async () => {
      mockTerminal.findFirst.mockResolvedValue({ id: TERMINAL });
      mockTurno.findFirst.mockResolvedValue(null); // no hay abierto
      mockTurno.create.mockResolvedValue(turnoAbierto());
      mockTurno.findUniqueOrThrow.mockResolvedValue(turnoAbierto());
      mockVenta.findMany.mockResolvedValue([]);
      mockMovimiento.findMany.mockResolvedValue([]);

      const res = await service.abrirTurno(SUCURSAL, USUARIO, {
        terminalId: TERMINAL,
        fondoApertura: '1000',
      });
      expect(res.resumen.saldoTeorico).toBe('1000.00');
      expect(res.resumen.ventasEfectivo).toBe('0.00');
    });
  });

  describe('registrarMovimiento', () => {
    it('lanza BadRequestException si el monto es <= 0', async () => {
      mockTurno.findFirst.mockResolvedValue(turnoAbierto());
      await expect(
        service.registrarMovimiento(SUCURSAL, 'turno1', { tipo: 'INGRESO', monto: '0' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si el turno ya esta cerrado', async () => {
      mockTurno.findFirst.mockResolvedValue(turnoAbierto({ estado: 'CERRADO' }));
      await expect(
        service.registrarMovimiento(SUCURSAL, 'turno1', { tipo: 'EGRESO', monto: '50' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cerrarTurno / arqueo', () => {
    it('calcula el saldo teorico y la diferencia (faltante)', async () => {
      mockTurno.findFirst.mockResolvedValue(turnoAbierto());
      mockTurno.findUniqueOrThrow.mockResolvedValue(turnoAbierto());
      // Ventas en efectivo: 500 + 300 = 800
      mockVenta.findMany.mockResolvedValue([
        { total: new Decimal('500') },
        { total: new Decimal('300') },
      ]);
      // Ingresos 200, egresos 100
      mockMovimiento.findMany.mockResolvedValue([
        { tipo: 'INGRESO', monto: new Decimal('200') },
        { tipo: 'EGRESO', monto: new Decimal('100') },
      ]);
      mockTurno.update.mockResolvedValue({});

      // saldoTeorico = 1000 + 800 + 200 - 100 = 1900; contado 1850 -> diferencia -50
      await service.cerrarTurno(SUCURSAL, 'turno1', { montoContado: '1850' });

      const dataUpdate = mockTurno.update.mock.calls[0]![0].data;
      expect(dataUpdate.estado).toBe('CERRADO');
      expect(new Decimal(dataUpdate.diferencia).toString()).toBe('-50');
    });
  });

  describe('listarTurnos', () => {
    it('incluye terminal y usuario, ordenado por apertura descendente', async () => {
      mockTurno.findMany.mockResolvedValue([
        { ...turnoAbierto(), terminal: { nombre: 'Caja 1' }, usuario: { email: 'cajero@nexo.com' } },
      ]);

      const r = await service.listarTurnos(SUCURSAL);

      expect(r).toHaveLength(1);
      expect(r[0]!.terminal.nombre).toBe('Caja 1');
      expect(r[0]!.usuario.email).toBe('cajero@nexo.com');
      const args = mockTurno.findMany.mock.calls[0]![0];
      expect(args.where.sucursalId).toBe(SUCURSAL);
      expect(args.orderBy).toEqual({ abiertoEn: 'desc' });
      expect(args.include.terminal.select.nombre).toBe(true);
      expect(args.include.usuario.select.email).toBe(true);
    });

    it('filtra por terminalId cuando se pasa', async () => {
      mockTurno.findMany.mockResolvedValue([]);
      await service.listarTurnos(SUCURSAL, { terminalId: TERMINAL });
      const args = mockTurno.findMany.mock.calls[0]![0];
      expect(args.where.terminalId).toBe(TERMINAL);
    });

    it('no filtra por terminal cuando no se pasa', async () => {
      mockTurno.findMany.mockResolvedValue([]);
      await service.listarTurnos(SUCURSAL);
      const args = mockTurno.findMany.mock.calls[0]![0];
      expect(args.where.terminalId).toBeUndefined();
    });

    it('capa el limite a 100 y respeta el minimo de 1', async () => {
      mockTurno.findMany.mockResolvedValue([]);
      await service.listarTurnos(SUCURSAL, { limite: 500 });
      expect(mockTurno.findMany.mock.calls[0]![0].take).toBe(100);

      await service.listarTurnos(SUCURSAL, { limite: -5 });
      expect(mockTurno.findMany.mock.calls[1]![0].take).toBe(1);
    });
  });

  describe('turnoActual', () => {
    it('devuelve null si no hay turno abierto', async () => {
      mockTurno.findFirst.mockResolvedValue(null);
      expect(await service.turnoActual(SUCURSAL, TERMINAL)).toBeNull();
    });

    it('incluye ventas en efectivo en el saldo teorico', async () => {
      mockTurno.findFirst.mockResolvedValue(turnoAbierto());
      mockTurno.findUniqueOrThrow.mockResolvedValue(turnoAbierto());
      mockVenta.findMany.mockResolvedValue([{ total: new Decimal('1500') }]);
      mockMovimiento.findMany.mockResolvedValue([]);

      const res = await service.turnoActual(SUCURSAL, TERMINAL);
      expect(res?.resumen.ventasEfectivo).toBe('1500.00');
      expect(res?.resumen.saldoTeorico).toBe('2500.00'); // 1000 + 1500
    });
  });
});
