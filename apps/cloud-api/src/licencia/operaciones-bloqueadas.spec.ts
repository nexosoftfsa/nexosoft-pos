import { describe, it, expect } from 'vitest';
import { bloqueadaPorSuscripcion } from './operaciones-bloqueadas';

describe('bloqueadaPorSuscripcion', () => {
  describe('lo que se bloquea: vender y operar', () => {
    const BLOQUEADAS: ReadonlyArray<readonly [string, string]> = [
      ['POST', '/api/v1/ventas'],
      ['POST', '/api/v1/presupuestos'],
      ['POST', '/api/v1/remitos'],
      ['POST', '/api/v1/catalogo/productos'],
      ['PUT', '/api/v1/catalogo/productos/p1'],
      ['DELETE', '/api/v1/catalogo/productos/p1'],
      ['POST', '/api/v1/stock/ajuste'],
      ['POST', '/api/v1/caja/turnos/abrir'],
      ['POST', '/api/v1/sync/push'],
      ['POST', '/api/v1/usuarios'],
    ];

    it.each(BLOQUEADAS)('%s %s', (metodo, ruta) => {
      expect(bloqueadaPorSuscripcion(metodo, ruta)).toBe(true);
    });
  });

  describe('lo que sigue funcionando aunque esté bloqueado (ADR-0056)', () => {
    it('todas las lecturas: son registros fiscales del comercio', () => {
      for (const ruta of [
        '/api/v1/reportes/ventas/resumen',
        '/api/v1/ventas',
        '/api/v1/reportes/libro-ventas',
        '/api/v1/clientes',
        '/api/v1/catalogo/productos',
      ]) {
        expect(bloqueadaPorSuscripcion('GET', ruta)).toBe(false);
      }
    });

    it('entrar al sistema, si no ni el aviso de bloqueo se puede ver', () => {
      expect(bloqueadaPorSuscripcion('POST', '/api/v1/auth/login')).toBe(false);
      expect(bloqueadaPorSuscripcion('POST', '/api/v1/auth/refresh')).toBe(false);
    });

    it('cerrar el turno de caja que quedó abierto', () => {
      expect(bloqueadaPorSuscripcion('POST', '/api/v1/caja/turnos/t1/cerrar')).toBe(false);
    });

    it('pero NO abrir uno nuevo', () => {
      expect(bloqueadaPorSuscripcion('POST', '/api/v1/caja/turnos/abrir')).toBe(true);
    });

    it('la configuración del comercio, para poder reactivar', () => {
      expect(bloqueadaPorSuscripcion('PUT', '/api/v1/comercio/logo')).toBe(false);
    });
  });

  it('no se confunde con rutas parecidas', () => {
    expect(bloqueadaPorSuscripcion('POST', '/api/v1/autenticacion-falsa')).toBe(true);
    expect(bloqueadaPorSuscripcion('POST', '/api/v1/cajaotracosa')).toBe(true);
  });

  it('tolera query y barra final', () => {
    expect(bloqueadaPorSuscripcion('POST', '/api/v1/caja/turnos/t1/cerrar/')).toBe(false);
    expect(bloqueadaPorSuscripcion('GET', '/api/v1/ventas?desde=2026-01-01')).toBe(false);
  });
});
