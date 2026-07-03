import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';
import { VentasService } from './ventas.service';
import { LibroDeVentasEnMemoria } from './libro/libro-de-ventas-en-memoria';

const USUARIO = { id: 'u1', email: 'cajero@nexo.com', sucursalId: 's1' };

function ventaDevuelta(overrides: Record<string, unknown> = {}) {
  return {
    id: 'v1',
    operacionId: 'op-1',
    estado: 'COMPLETADA',
    subtotal: new Decimal('240'),
    descuento: new Decimal('0'),
    total: new Decimal('240'),
    medioPago: 'EFECTIVO',
    cae: '12345678901234',
    caeFechaVto: new Date('2026-07-06'),
    numeroComprobante: 1,
    tipoComprobante: 'FacturaB',
    creadaEn: new Date('2026-06-26'),
    sincronizadaEn: null,
    sucursalId: 's1',
    usuarioId: 'u1',
    items: [{ id: 'i1' }, { id: 'i2' }],
    ...overrides,
  };
}

const DTO = {
  operacionId: 'op-1',
  medioPago: 'EFECTIVO' as const,
  items: [
    { productoId: 'p1', cantidad: '2', precioUnitario: '100' },
    { productoId: 'p2', cantidad: '1', precioUnitario: '50', descuento: '10' },
  ],
};

describe('VentasService', () => {
  let prisma: {
    venta: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let tx: {
    venta: { create: ReturnType<typeof vi.fn> };
    movimientoStock: { create: ReturnType<typeof vi.fn> };
  };
  let cae: { autorizar: ReturnType<typeof vi.fn> };
  let libro: LibroDeVentasEnMemoria;
  let motor: { crearRespaldo: ReturnType<typeof vi.fn> };
  let config: { get: ReturnType<typeof vi.fn> };
  let service: VentasService;

  beforeEach(() => {
    tx = {
      venta: { create: vi.fn().mockResolvedValue(ventaDevuelta()) },
      movimientoStock: { create: vi.fn().mockResolvedValue({}) },
    };
    prisma = {
      venta: { findUnique: vi.fn().mockResolvedValue(null), findMany: vi.fn() },
      $transaction: vi.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
    };
    cae = {
      autorizar: vi.fn().mockResolvedValue({
        cae: '12345678901234',
        caeFechaVto: new Date('2026-07-06'),
        numeroComprobante: 1,
        tipoComprobante: 'FacturaB',
      }),
    };
    libro = new LibroDeVentasEnMemoria();
    motor = { crearRespaldo: vi.fn().mockResolvedValue({}) };
    config = { get: vi.fn().mockReturnValue('false') };

    service = new VentasService(
      prisma as never,
      cae as never,
      libro as never,
      motor as never,
      config as never,
    );
  });

  describe('idempotencia', () => {
    it('devuelve la venta existente sin re-procesar si el operacionId ya existe', async () => {
      prisma.venta.findUnique.mockResolvedValue(ventaDevuelta());

      const result = await service.registrar(USUARIO, DTO);

      expect(result.id).toBe('v1');
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(cae.autorizar).not.toHaveBeenCalled();
    });
  });

  describe('registrar venta nueva', () => {
    it('recalcula los totales con Decimal a partir de los ítems', async () => {
      await service.registrar(USUARIO, DTO);

      const data = tx.venta.create.mock.calls[0]![0].data;
      // 2*100 + (1*50 - 10) = 200 + 40 = 240
      expect(data.subtotal.toString()).toBe('240');
      expect(data.total.toString()).toBe('240');
    });

    it('pide CAE con el total calculado', async () => {
      await service.registrar(USUARIO, DTO);
      expect(cae.autorizar).toHaveBeenCalledWith(
        expect.objectContaining({ total: '240', sucursalId: 's1' }),
      );
    });

    it('registra un movimiento de stock VENTA por cada ítem', async () => {
      await service.registrar(USUARIO, DTO);

      expect(tx.movimientoStock.create).toHaveBeenCalledTimes(2);
      const primero = tx.movimientoStock.create.mock.calls[0]![0].data;
      expect(primero.tipo).toBe('VENTA');
      expect(primero.productoId).toBe('p1');
      expect(primero.ventaId).toBe('v1');
    });

    it('agrega una fila al libro de ventas', async () => {
      await service.registrar(USUARIO, DTO);

      expect(libro.filas).toHaveLength(1);
      expect(libro.filas[0]?.operacionId).toBe('op-1');
      expect(libro.filas[0]?.total).toBe('240');
      expect(libro.filas[0]?.usuario).toBe('cajero@nexo.com');
    });

    it('NO dispara respaldo completo si el flag está en false', async () => {
      await service.registrar(USUARIO, DTO);
      expect(motor.crearRespaldo).not.toHaveBeenCalled();
    });

    it('dispara respaldo completo si RESPALDO_EN_CADA_VENTA=true', async () => {
      config.get.mockReturnValue('true');
      await service.registrar(USUARIO, DTO);
      expect(motor.crearRespaldo).toHaveBeenCalledOnce();
    });
  });

  describe('pago combinado', () => {
    it('con varios medios: persiste el desglose y el medioPago resumen queda COMBINADO', async () => {
      await service.registrar(USUARIO, {
        ...DTO,
        pagos: [
          { medioPago: 'EFECTIVO', monto: '140' },
          { medioPago: 'TARJETA_CREDITO', monto: '100' },
        ],
      } as never);

      const data = tx.venta.create.mock.calls[0]![0].data;
      expect(data.medioPago).toBe('COMBINADO');
      expect(data.pagos.create).toHaveLength(2);
      expect(data.pagos.create[0].medioPago).toBe('EFECTIVO');
    });

    it('sin desglose: usa el medioPago del DTO y no crea pagos', async () => {
      await service.registrar(USUARIO, DTO);
      const data = tx.venta.create.mock.calls[0]![0].data;
      expect(data.medioPago).toBe('EFECTIVO');
      expect(data.pagos).toBeUndefined();
    });
  });

  describe('robustez de efectos posteriores', () => {
    it('no tumba la venta si el libro de ventas falla', async () => {
      const libroRoto = { registrar: vi.fn().mockRejectedValue(new Error('disco lleno')) };
      service = new VentasService(
        prisma as never,
        cae as never,
        libroRoto as never,
        motor as never,
        config as never,
      );

      const result = await service.registrar(USUARIO, DTO);
      expect(result.id).toBe('v1'); // la venta se devolvió igual
    });
  });
});
