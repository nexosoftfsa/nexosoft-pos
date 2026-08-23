import { describe, it, expect } from 'vitest';
import { parsearEstadoAccesoRemoto } from './estado-acceso-remoto';

describe('parsearEstadoAccesoRemoto', () => {
  it('lee el estado que escribe instalar-acceso-remoto.ps1 cuando el túnel quedó activo', () => {
    const texto = JSON.stringify({
      estado: 'activo',
      url: 'https://lagus.nexosoft.com.ar',
      mensaje: null,
      alcanzable: true,
      actualizadoEn: '2026-08-22T18:30:00.0000000Z',
    });
    expect(parsearEstadoAccesoRemoto(texto)).toEqual({
      estado: 'activo',
      url: 'https://lagus.nexosoft.com.ar',
      mensaje: null,
      alcanzable: true,
      actualizadoEn: '2026-08-22T18:30:00.0000000Z',
    });
  });

  it('lee el estado apagado (acceso remoto desactivado a propósito)', () => {
    const texto = JSON.stringify({
      estado: 'apagado',
      url: null,
      mensaje: 'El acceso remoto esta desactivado en esta PC.',
      alcanzable: null,
      actualizadoEn: '2026-08-22T18:30:00Z',
    });
    const r = parsearEstadoAccesoRemoto(texto);
    expect(r?.estado).toBe('apagado');
    expect(r?.url).toBeNull();
  });

  it('tolera un archivo escrito con BOM (PowerShell lo agrega solo)', () => {
    const texto =
      String.fromCharCode(0xfeff) +
      JSON.stringify({ estado: 'activo', url: 'https://x.nexosoft.com.ar' });
    expect(parsearEstadoAccesoRemoto(texto)?.url).toBe('https://x.nexosoft.com.ar');
  });

  it('completa con null los campos que el script no haya escrito', () => {
    expect(parsearEstadoAccesoRemoto(JSON.stringify({ estado: 'activo' }))).toEqual({
      estado: 'activo',
      url: null,
      mensaje: null,
      alcanzable: null,
      actualizadoEn: null,
    });
  });

  it('devuelve null si el archivo está corrupto o a medio escribir', () => {
    expect(parsearEstadoAccesoRemoto('{"estado":"acti')).toBeNull();
    expect(parsearEstadoAccesoRemoto('')).toBeNull();
  });

  it('devuelve null ante un estado desconocido, en vez de propagarlo al POS', () => {
    expect(parsearEstadoAccesoRemoto(JSON.stringify({ estado: 'cualquier-cosa' }))).toBeNull();
  });

  it('devuelve null si la url no es una url', () => {
    expect(
      parsearEstadoAccesoRemoto(JSON.stringify({ estado: 'activo', url: 'lagus' })),
    ).toBeNull();
  });
});
