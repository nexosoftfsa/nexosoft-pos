import { describe, it, expect } from 'vitest';
import { evaluarFortaleza } from './fortaleza-password';

describe('evaluarFortaleza', () => {
  it('acepta una contraseña larga y mezclada', () => {
    expect(evaluarFortaleza('Melon-Tractor-92')).toEqual({ debil: false, motivo: null });
  });

  it('acepta una frase larga aunque sea toda en minúsculas', () => {
    // 16+ caracteres: aunque sea de un solo tipo, deja de ser adivinable.
    expect(evaluarFortaleza('melontractorverde').debil).toBe(false);
  });

  it('rechaza la que exige hoy el instalador (8 caracteres)', () => {
    const r = evaluarFortaleza('Abcd1234');
    expect(r.debil).toBe(true);
    expect(r.motivo).toContain('menos de 12');
  });

  it('rechaza las clásicas', () => {
    expect(evaluarFortaleza('123456789').debil).toBe(true);
    expect(evaluarFortaleza('Password1').debil).toBe(true);
    expect(evaluarFortaleza('administrador').motivo).toContain('más usadas');
  });

  it('rechaza la que más se usa en la vida real: el nombre del comercio', () => {
    const r = evaluarFortaleza('LagusMinimarket2026', { nombreComercio: 'Lagus Minimarket' });
    expect(r.debil).toBe(true);
    expect(r.motivo).toContain('nombre del comercio');
  });

  it('detecta el nombre del comercio aunque cambie la capitalización', () => {
    expect(evaluarFortaleza('xxlagusxx-2026', { nombreComercio: 'LAGUS' }).debil).toBe(true);
  });

  it('rechaza la que contiene el usuario', () => {
    const r = evaluarFortaleza('rodrigo-2026-ok', { email: 'rodrigo@nexo.com' });
    expect(r.debil).toBe(true);
    expect(r.motivo).toContain('usuario');
  });

  it('ignora pistas demasiado cortas, que darían falsos positivos', () => {
    // "de" y "la" aparecerían en cualquier contraseña.
    expect(evaluarFortaleza('Verde-Tractor-92', { nombreComercio: 'La de Ana' }).debil).toBe(false);
  });

  it('rechaza sólo números aunque sean muchos', () => {
    const r = evaluarFortaleza('123456789012345');
    expect(r.debil).toBe(true);
    expect(r.motivo).toContain('números');
  });

  it('no se confunde con espacios al principio o al final', () => {
    expect(evaluarFortaleza('  Abcd1234  ').debil).toBe(true);
  });
});
