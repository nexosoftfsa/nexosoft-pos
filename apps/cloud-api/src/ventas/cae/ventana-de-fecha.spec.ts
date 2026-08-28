import { describe, expect, it } from 'vitest';

import {
  diasDeAntiguedad,
  fueraDeVentanaArca,
  motivoVentanaVencida,
  porVencerLaVentanaArca,
} from './ventana-de-fecha';

const HOY = new Date(2026, 7, 28, 10, 42);
const dias = (n: number) => new Date(2026, 7, 28 - n, 15, 5);

describe('diasDeAntiguedad', () => {
  it('cuenta días de calendario, no horas', () => {
    // La venta de ayer a las 23:50 y la consulta de hoy a las 00:10 son un día
    // de diferencia, no cero.
    expect(diasDeAntiguedad(new Date(2026, 7, 27, 23, 50), new Date(2026, 7, 28, 0, 10))).toBe(1);
    expect(diasDeAntiguedad(new Date(2026, 7, 28, 8, 0), HOY)).toBe(0);
  });

  it('cruza el fin de mes', () => {
    expect(diasDeAntiguedad(new Date(2026, 6, 30), new Date(2026, 7, 2))).toBe(3);
  });
});

describe('fueraDeVentanaArca', () => {
  it('hasta 5 días ARCA todavía la toma', () => {
    for (const n of [0, 1, 4, 5]) {
      expect(fueraDeVentanaArca(dias(n), HOY)).toBe(false);
    }
  });

  it('a partir del sexto día ya no', () => {
    // Este es el caso feo: ARCA estuvo caída (o el comercio sin internet) un
    // fin de semana largo, y las ventas de esos días ya no se pueden autorizar
    // con su fecha real.
    expect(fueraDeVentanaArca(dias(6), HOY)).toBe(true);
    expect(fueraDeVentanaArca(dias(30), HOY)).toBe(true);
  });

  it('una fecha muy adelantada tampoco entra (reloj de la PC mal puesto)', () => {
    expect(fueraDeVentanaArca(new Date(2026, 8, 20), HOY)).toBe(true);
  });
});

describe('porVencerLaVentanaArca', () => {
  it('avisa en los últimos días, para verlo venir', () => {
    expect(porVencerLaVentanaArca(dias(3), HOY)).toBe(true);
    expect(porVencerLaVentanaArca(dias(5), HOY)).toBe(true);
  });

  it('no avisa por una venta de hoy', () => {
    expect(porVencerLaVentanaArca(dias(0), HOY)).toBe(false);
    expect(porVencerLaVentanaArca(dias(2), HOY)).toBe(false);
  });

  it('no avisa por una que ya venció: para esa el aviso llegó tarde', () => {
    expect(porVencerLaVentanaArca(dias(9), HOY)).toBe(false);
  });
});

describe('motivoVentanaVencida', () => {
  it('dice de cuándo es la venta y qué hay que hacer', () => {
    const motivo = motivoVentanaVencida(dias(8), HOY);
    expect(motivo).toContain('hace 8 días');
    expect(motivo).toContain('contador');
  });
});
