import { describe, it, expect } from 'vitest';
import { PLAN_MINIMO, Plan, type ModuloId } from '@nexosoft/licencias';
import { fueraDelPlan, moduloDeRuta } from './operaciones-por-plan';

describe('fueraDelPlan', () => {
  describe('las lecturas nunca se bloquean (ADR-0067 §6)', () => {
    it.each(['GET', 'HEAD', 'OPTIONS'])(
      '%s a un módulo que no está en el plan igual pasa',
      (metodo) => {
        expect(fueraDelPlan(metodo, '/api/v1/reportes/ventas', Plan.Basica)).toBe(false);
      },
    );

    it('bajar de plan no esconde lo que ya se cargó: la cuenta corriente se sigue viendo', () => {
      expect(fueraDelPlan('GET', '/api/v1/clientes/7/ctacte', Plan.Basica)).toBe(false);
    });

    it('...pero no se pueden registrar movimientos nuevos', () => {
      expect(fueraDelPlan('POST', '/api/v1/clientes/7/ctacte', Plan.Basica)).toBe(true);
    });
  });

  describe('Básica', () => {
    it('vende, cobra y factura', () => {
      expect(fueraDelPlan('POST', '/api/v1/ventas', Plan.Basica)).toBe(false);
      expect(fueraDelPlan('POST', '/api/v1/caja/turnos', Plan.Basica)).toBe(false);
      expect(fueraDelPlan('POST', '/api/v1/fiscal/cae', Plan.Basica)).toBe(false);
    });

    it('mueve stock y catálogo', () => {
      expect(fueraDelPlan('POST', '/api/v1/stock/ajustes', Plan.Basica)).toBe(false);
      expect(fueraDelPlan('PUT', '/api/v1/catalogo/productos/1', Plan.Basica)).toBe(false);
    });

    it('no llega a presupuestos, remitos ni proveedores', () => {
      expect(fueraDelPlan('POST', '/api/v1/presupuestos', Plan.Basica)).toBe(true);
      expect(fueraDelPlan('POST', '/api/v1/remitos', Plan.Basica)).toBe(true);
      expect(fueraDelPlan('POST', '/api/v1/proveedores', Plan.Basica)).toBe(true);
    });
  });

  describe('Plus', () => {
    it('llega a la gestión comercial', () => {
      expect(fueraDelPlan('POST', '/api/v1/presupuestos', Plan.Plus)).toBe(false);
      expect(fueraDelPlan('POST', '/api/v1/medios-pago/tarjetas', Plan.Plus)).toBe(false);
    });

    it('no llega al asistente ni al acceso remoto', () => {
      expect(fueraDelPlan('POST', '/api/v1/asistente/preguntar', Plan.Plus)).toBe(true);
      expect(fueraDelPlan('POST', '/api/v1/acceso-remoto/tunel', Plan.Plus)).toBe(true);
      expect(fueraDelPlan('POST', '/api/v1/respaldo/ahora', Plan.Plus)).toBe(true);
    });
  });

  describe('Premium', () => {
    it('no le corta nada', () => {
      const rutas = [
        '/api/v1/ventas',
        '/api/v1/presupuestos',
        '/api/v1/asistente/preguntar',
        '/api/v1/acceso-remoto/tunel',
        '/api/v1/respaldo/ahora',
      ];
      for (const ruta of rutas) expect(fueraDelPlan('POST', ruta, Plan.Premium)).toBe(false);
    });
  });

  describe('la infraestructura nunca se gatea por plan', () => {
    it.each([
      '/api/v1/auth/login',
      '/api/v1/sync/subir',
      '/api/v1/terminales/registrar',
      '/api/v1/licencia/estado',
      '/health',
    ])('%s pasa hasta con el plan más chico', (ruta) => {
      expect(fueraDelPlan('POST', ruta, Plan.Basica)).toBe(false);
    });

    it('entrar al sistema es lo primero: sin login no se ve ni el aviso', () => {
      expect(fueraDelPlan('POST', '/api/v1/auth/login', Plan.Basica)).toBe(false);
    });
  });

  describe('normalización de la ruta', () => {
    it('ignora el prefijo, la query y la barra final', () => {
      expect(fueraDelPlan('POST', '/api/v1/reportes/exportar?desde=2026-01-01', Plan.Basica)).toBe(
        true,
      );
      expect(fueraDelPlan('POST', '/reportes/', Plan.Basica)).toBe(true);
    });
  });
});

describe('moduloDeRuta', () => {
  it('mapea cada familia de rutas a un módulo de la tabla de planes', () => {
    expect(moduloDeRuta('/api/v1/ventas')).toBe('pos');
    expect(moduloDeRuta('/api/v1/clientes/1')).toBe('ctacte');
    expect(moduloDeRuta('/api/v1/asistente/preguntar')).toBe('ia');
  });

  it('devuelve null para lo que no se vende como módulo', () => {
    expect(moduloDeRuta('/api/v1/auth/login')).toBeNull();
    expect(moduloDeRuta('/health')).toBeNull();
  });

  it('todo módulo mapeado existe en la tabla de planes', () => {
    // Si alguien inventa un ModuloId acá que no está en PLAN_MINIMO, el gateo
    // sería silenciosamente permisivo.
    const rutas = [
      '/ventas',
      '/caja',
      '/fiscal',
      '/catalogo',
      '/stock',
      '/comercio',
      '/usuarios',
      '/credenciales',
      '/clientes',
      '/presupuestos',
      '/remitos',
      '/proveedores',
      '/medios-pago',
      '/reportes',
      '/asistente',
      '/acceso-remoto',
      '/respaldo',
    ];
    for (const ruta of rutas) {
      const modulo = moduloDeRuta(ruta) as ModuloId;
      expect(modulo).not.toBeNull();
      expect(PLAN_MINIMO[modulo]).toBeDefined();
    }
  });
});
