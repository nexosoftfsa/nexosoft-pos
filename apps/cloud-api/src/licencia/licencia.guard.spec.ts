import { describe, it, expect } from 'vitest';
import { HttpException } from '@nestjs/common';
import { EstadoSuscripcion, Plan, type EstadoLicencia } from '@nexosoft/licencias';
import { LicenciaGuard } from './licencia.guard';

function contexto(metodo: string, url: string) {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({ method: metodo, originalUrl: url }) }),
  } as never;
}

function guardCon(estado: EstadoLicencia) {
  return new LicenciaGuard({ estado: () => estado } as never);
}

const ACTIVA: EstadoLicencia = {
  estado: EstadoSuscripcion.Activa,
  plan: Plan.Premium,
  puedeVender: true,
  aviso: null,
  sinValidar: false,
};

const BLOQUEADA: EstadoLicencia = {
  estado: EstadoSuscripcion.Bloqueada,
  plan: Plan.Premium,
  puedeVender: false,
  aviso: 'Pagá la suscripción para seguir usando el sistema.',
  sinValidar: false,
};

const ADVERTENCIA: EstadoLicencia = {
  estado: EstadoSuscripcion.Advertencia,
  plan: Plan.Premium,
  puedeVender: true,
  aviso: 'El pago venció.',
  sinValidar: false,
};

describe('LicenciaGuard', () => {
  describe('con la suscripción al día no toca nada', () => {
    it('deja vender', () => {
      expect(guardCon(ACTIVA).canActivate(contexto('POST', '/api/v1/ventas'))).toBe(true);
    });
  });

  describe('en advertencia todavía se puede operar', () => {
    it('deja vender, que es el punto de que sea un aviso y no un corte', () => {
      expect(guardCon(ADVERTENCIA).canActivate(contexto('POST', '/api/v1/ventas'))).toBe(true);
    });
  });

  describe('bloqueada', () => {
    it('corta la venta con 402 y explica por qué', () => {
      try {
        guardCon(BLOQUEADA).canActivate(contexto('POST', '/api/v1/ventas'));
        expect.unreachable('tenía que lanzar');
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException);
        const err = e as HttpException;
        expect(err.getStatus()).toBe(402);
        expect(JSON.stringify(err.getResponse())).toContain('Pagá la suscripción');
      }
    });

    it('deja cerrar la caja que quedó abierta', () => {
      expect(
        guardCon(BLOQUEADA).canActivate(contexto('POST', '/api/v1/caja/turnos/t1/cerrar')),
      ).toBe(true);
    });

    it('deja entrar al sistema, si no ni el aviso se puede ver', () => {
      expect(guardCon(BLOQUEADA).canActivate(contexto('POST', '/api/v1/auth/login'))).toBe(true);
    });

    it('deja leer y exportar lo histórico: son registros del comercio', () => {
      expect(
        guardCon(BLOQUEADA).canActivate(contexto('GET', '/api/v1/reportes/libro-ventas')),
      ).toBe(true);
    });

    it('pero no deja abrir un turno nuevo', () => {
      expect(() =>
        guardCon(BLOQUEADA).canActivate(contexto('POST', '/api/v1/caja/turnos/abrir')),
      ).toThrow(HttpException);
    });
  });

  describe('el plan (ADR-0067 §3)', () => {
    const basica: EstadoLicencia = { ...ACTIVA, plan: Plan.Basica };

    it('deja hacer lo que el plan incluye', () => {
      expect(guardCon(basica).canActivate(contexto('POST', '/api/v1/ventas'))).toBe(true);
      expect(guardCon(basica).canActivate(contexto('POST', '/api/v1/stock/ajustes'))).toBe(true);
    });

    it('corta con 402 lo que no incluye, y dice en qué plan está', () => {
      try {
        guardCon(basica).canActivate(contexto('POST', '/api/v1/presupuestos'));
        expect.unreachable('tenía que lanzar');
      } catch (e) {
        const err = e as HttpException;
        expect(err.getStatus()).toBe(402);
        const cuerpo = JSON.stringify(err.getResponse());
        expect(cuerpo).toContain('FueraDelPlan');
        expect(cuerpo).toContain('Básica');
        expect(cuerpo).toContain('Plus');
      }
    });

    it('deja ver y exportar lo de un módulo que ya no está en el plan', () => {
      expect(guardCon(basica).canActivate(contexto('GET', '/api/v1/presupuestos'))).toBe(true);
    });

    it('un comercio bloqueado se entera del bloqueo, no del plan', () => {
      // Los dos motivos aplican; gana el que explica mejor por qué no vende.
      try {
        guardCon({ ...BLOQUEADA, plan: Plan.Basica }).canActivate(
          contexto('POST', '/api/v1/ventas'),
        );
        expect.unreachable('tenía que lanzar');
      } catch (e) {
        expect(JSON.stringify((e as HttpException).getResponse())).toContain(
          'SuscripcionBloqueada',
        );
      }
    });
  });
});
