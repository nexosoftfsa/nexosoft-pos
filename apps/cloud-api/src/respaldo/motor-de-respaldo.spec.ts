import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gzipSync } from 'node:zlib';
import { MotorDeRespaldo } from './motor-de-respaldo';
import { DestinoEnMemoria } from './destinos/destino-en-memoria';

/** Construye un mock de PrismaService que soporta las dos formas de $transaction. */
function crearPrismaMock() {
  const tablas = [
    'sucursal', 'categoria', 'usuario', 'producto',
    'venta', 'itemVenta', 'movimientoStock', 'refreshToken',
  ] as const;

  const mock: Record<string, Record<string, ReturnType<typeof vi.fn>>> = {};
  for (const t of tablas) {
    mock[t] = {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({}),
    };
  }

  (mock as Record<string, unknown>)['$transaction'] = vi.fn((arg: unknown) => {
    if (Array.isArray(arg)) return Promise.all(arg);
    return (arg as (tx: unknown) => unknown)(mock);
  });

  return mock;
}

describe('MotorDeRespaldo', () => {
  let prisma: ReturnType<typeof crearPrismaMock>;
  let destino: DestinoEnMemoria;

  beforeEach(() => {
    prisma = crearPrismaMock();
    destino = new DestinoEnMemoria();
  });

  describe('crearRespaldo', () => {
    it('genera un snapshot comprimido y lo escribe en el destino', async () => {
      prisma['sucursal']!['findMany']!.mockResolvedValue([{ id: 's1', nombre: 'Centro' }]);

      const motor = new MotorDeRespaldo(prisma as never, destino, 7);
      const meta = await motor.crearRespaldo();

      expect(meta.nombre).toMatch(/^nexosoft-.*\.json\.gz$/);
      expect(meta.tamanoBytes).toBeGreaterThan(0);

      const lista = await destino.listar();
      expect(lista).toHaveLength(1);
    });

    it('el contenido descomprimido tiene la estructura y los datos esperados', async () => {
      prisma['sucursal']!['findMany']!.mockResolvedValue([{ id: 's1', nombre: 'Centro' }]);
      prisma['producto']!['findMany']!.mockResolvedValue([{ id: 'p1', codigo: 'A' }]);

      const motor = new MotorDeRespaldo(prisma as never, destino, 7);
      const meta = await motor.crearRespaldo();

      const buf = await destino.leer(meta.nombre);
      const snap = JSON.parse((await import('node:zlib')).gunzipSync(buf).toString('utf-8'));

      expect(snap.version).toBe('1');
      expect(snap.checksum).toBeTypeOf('string');
      expect(snap.tablas.sucursales).toEqual([{ id: 's1', nombre: 'Centro' }]);
      expect(snap.tablas.productos).toEqual([{ id: 'p1', codigo: 'A' }]);
    });
  });

  describe('retención', () => {
    it('elimina los respaldos más viejos según la política', async () => {
      // Precargo 3 respaldos viejos con nombres ordenables
      await destino.escribir('nexosoft-2020-01-01.json.gz', Buffer.from('x'));
      await destino.escribir('nexosoft-2021-01-01.json.gz', Buffer.from('x'));
      await destino.escribir('nexosoft-2022-01-01.json.gz', Buffer.from('x'));

      const motor = new MotorDeRespaldo(prisma as never, destino, 2);
      await motor.crearRespaldo(); // crea el 4º (timestamp actual, ordena primero)

      const lista = await destino.listar();
      expect(lista).toHaveLength(2);
      // El más nuevo es el recién creado
      expect(lista[0]?.nombre.startsWith('nexosoft-202')).toBe(true);
    });

    it('con retener=0 no elimina nada', async () => {
      await destino.escribir('nexosoft-2020-01-01.json.gz', Buffer.from('x'));
      const motor = new MotorDeRespaldo(prisma as never, destino, 0);
      await motor.crearRespaldo();

      const lista = await destino.listar();
      expect(lista.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('restaurar', () => {
    it('round-trip: restaura reinsertando los datos del snapshot', async () => {
      prisma['sucursal']!['findMany']!.mockResolvedValue([{ id: 's1', nombre: 'Centro' }]);
      prisma['producto']!['findMany']!.mockResolvedValue([{ id: 'p1', codigo: 'A' }]);

      const motor = new MotorDeRespaldo(prisma as never, destino, 7);
      const meta = await motor.crearRespaldo();

      await motor.restaurar(meta.nombre);

      expect(prisma['sucursal']!['deleteMany']!).toHaveBeenCalled();
      expect(prisma['sucursal']!['createMany']!).toHaveBeenCalledWith({
        data: [{ id: 's1', nombre: 'Centro' }],
      });
      expect(prisma['producto']!['createMany']!).toHaveBeenCalledWith({
        data: [{ id: 'p1', codigo: 'A' }],
      });
    });

    it('rechaza un respaldo con checksum corrupto', async () => {
      const snapshotMalo = {
        version: '1',
        generadoEn: new Date().toISOString(),
        checksum: 'checksum-invalido',
        tablas: {
          sucursales: [], categorias: [], usuarios: [], productos: [],
          ventas: [], itemsVenta: [], movimientosStock: [],
        },
      };
      await destino.escribir(
        'nexosoft-corrupto.json.gz',
        gzipSync(Buffer.from(JSON.stringify(snapshotMalo))),
      );

      const motor = new MotorDeRespaldo(prisma as never, destino, 7);
      await expect(motor.restaurar('nexosoft-corrupto.json.gz')).rejects.toThrow(/corrupto/i);
    });

    it('rechaza un respaldo de versión incompatible', async () => {
      const snapshotViejo = {
        version: '0',
        generadoEn: new Date().toISOString(),
        checksum: 'lo-que-sea',
        tablas: {
          sucursales: [], categorias: [], usuarios: [], productos: [],
          ventas: [], itemsVenta: [], movimientosStock: [],
        },
      };
      await destino.escribir(
        'nexosoft-viejo.json.gz',
        gzipSync(Buffer.from(JSON.stringify(snapshotViejo))),
      );

      const motor = new MotorDeRespaldo(prisma as never, destino, 7);
      await expect(motor.restaurar('nexosoft-viejo.json.gz')).rejects.toThrow(/incompatible/i);
    });
  });
});
