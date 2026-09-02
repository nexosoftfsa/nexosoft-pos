import { describe, expect, it } from 'vitest';

import {
  fechaDeVenta,
  TOLERANCIA_ADELANTO_MS,
  TOLERANCIA_ATRASO_MS,
} from './fecha-de-venta';

const AHORA = new Date('2026-09-02T18:00:00.000Z');

describe('fechaDeVenta', () => {
  it('usa la fecha que mandó el POS', () => {
    const venta = new Date('2026-09-02T14:00:00.000Z');
    expect(fechaDeVenta(venta.toISOString(), AHORA).getTime()).toBe(venta.getTime());
  });

  it('sin fecha usa la del servidor (POS viejo, retrocompatible)', () => {
    expect(fechaDeVenta(undefined, AHORA)).toBe(AHORA);
    expect(fechaDeVenta('', AHORA)).toBe(AHORA);
  });

  it('una fecha ilegible no rompe la venta: usa la del servidor', () => {
    expect(fechaDeVenta('ayer a la tarde', AHORA)).toBe(AHORA);
  });

  it('tolera un desfase chico de reloj hacia adelante', () => {
    const apenasAdelantado = new Date(AHORA.getTime() + TOLERANCIA_ADELANTO_MS - 1000);
    expect(fechaDeVenta(apenasAdelantado.toISOString(), AHORA).getTime()).toBe(
      apenasAdelantado.getTime(),
    );
  });

  it('rechaza una fecha del futuro: es un reloj mal puesto', () => {
    const futura = new Date(AHORA.getTime() + TOLERANCIA_ADELANTO_MS + 1000);
    expect(fechaDeVenta(futura.toISOString(), AHORA)).toBe(AHORA);
  });

  it('acepta una venta de días atrás: es el caso que venimos a arreglar', () => {
    const haceTresDias = new Date(AHORA.getTime() - 3 * 24 * 60 * 60 * 1000);
    expect(fechaDeVenta(haceTresDias.toISOString(), AHORA).getTime()).toBe(
      haceTresDias.getTime(),
    );
  });

  it('rechaza una fecha absurdamente vieja: es un reloj sin batería', () => {
    const vieja = new Date(AHORA.getTime() - TOLERANCIA_ATRASO_MS - 1000);
    expect(fechaDeVenta(vieja.toISOString(), AHORA)).toBe(AHORA);
    expect(fechaDeVenta('2000-01-01T00:00:00.000Z', AHORA)).toBe(AHORA);
  });
});
