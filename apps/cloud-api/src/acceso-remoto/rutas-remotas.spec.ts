import { describe, it, expect } from 'vitest';
import { normalizarRuta, permitidaEnRemoto } from './rutas-remotas';

describe('normalizarRuta', () => {
  it('saca el prefijo global de la API', () => {
    expect(normalizarRuta('/api/v1/reportes/ventas/resumen')).toBe('/reportes/ventas/resumen');
  });

  it('saca la query', () => {
    expect(normalizarRuta('/api/v1/reportes/stock/bajo?umbral=5')).toBe('/reportes/stock/bajo');
  });

  it('saca la barra final', () => {
    expect(normalizarRuta('/api/v1/comercio/logo/')).toBe('/comercio/logo');
  });
});

describe('permitidaEnRemoto', () => {
  /**
   * Estos son, uno por uno, los endpoints que consume `admin-web`
   * (ver apps/admin-web/src/api/). Si alguno deja de estar permitido, el
   * panel se rompe **sólo desde afuera del local**.
   */
  const DEL_PANEL: ReadonlyArray<readonly [string, string]> = [
    ['POST', '/api/v1/auth/login'],
    ['GET', '/api/v1/comercio/logo'],
    ['GET', '/api/v1/reportes/ventas/resumen?desde=2026-08-01'],
    ['GET', '/api/v1/reportes/ventas/serie'],
    ['GET', '/api/v1/reportes/ventas/por-medio-pago'],
    ['GET', '/api/v1/reportes/ventas/por-terminal'],
    ['GET', '/api/v1/reportes/productos/top?limite=10'],
    ['GET', '/api/v1/reportes/stock/bajo?umbral=5'],
    ['GET', '/api/v1/reportes/libro-ventas'],
  ];

  it.each(DEL_PANEL)('deja pasar lo que usa el panel: %s %s', (metodo, ruta) => {
    expect(permitidaEnRemoto(metodo, ruta)).toBe(true);
  });

  it('deja pasar el health', () => {
    expect(permitidaEnRemoto('GET', '/api/v1/health')).toBe(true);
  });

  it('deja pasar el preflight de CORS', () => {
    expect(permitidaEnRemoto('OPTIONS', '/api/v1/reportes/ventas/serie')).toBe(true);
  });

  /**
   * El corazón de ADR-0057: con una credencial robada, desde afuera no se
   * puede tocar nada.
   */
  const PROHIBIDAS: ReadonlyArray<readonly [string, string]> = [
    ['POST', '/api/v1/ventas'],
    ['POST', '/api/v1/catalogo/productos'],
    ['PUT', '/api/v1/catalogo/productos/p1'],
    ['DELETE', '/api/v1/catalogo/productos/p1'],
    ['PATCH', '/api/v1/stock/ajuste'],
    ['POST', '/api/v1/auth/register'],
    ['POST', '/api/v1/usuarios'],
    ['POST', '/api/v1/sync/push'],
    ['PUT', '/api/v1/comercio/logo'],
    ['POST', '/api/v1/caja/turnos/abrir'],
  ];

  it.each(PROHIBIDAS)('bloquea las escrituras desde afuera: %s %s', (metodo, ruta) => {
    expect(permitidaEnRemoto(metodo, ruta)).toBe(false);
  });

  /**
   * Lecturas que igual no tienen por qué salir a internet: devuelven cosas
   * que sirven para entrar (credenciales de empleado) o para llevarse la base
   * entera (respaldos).
   */
  const LECTURAS_SENSIBLES: ReadonlyArray<readonly [string, string]> = [
    ['GET', '/api/v1/usuarios/u1/credencial'],
    ['GET', '/api/v1/usuarios'],
    ['GET', '/api/v1/respaldo'],
    ['GET', '/api/v1/sync/cambios'],
    ['GET', '/api/v1/catalogo/productos'],
  ];

  it.each(LECTURAS_SENSIBLES)('bloquea lecturas sensibles: %s %s', (metodo, ruta) => {
    expect(permitidaEnRemoto(metodo, ruta)).toBe(false);
  });

  it('no se deja engañar con mayúsculas ni con prefijos parecidos', () => {
    expect(permitidaEnRemoto('get', '/api/v1/reportes/ventas/serie')).toBe(true);
    // "reportesfalsos" no es "reportes".
    expect(permitidaEnRemoto('GET', '/api/v1/reportesfalsos/todo')).toBe(false);
    expect(permitidaEnRemoto('POST', '/api/v1/auth/login-credencial')).toBe(false);
  });
});
