import { describe, expect, it } from 'vitest';

import {
  cuentaParaElTope,
  esRafagaAnormal,
  motivoRafaga,
  TOPE_VENTAS_POR_MINUTO,
  VENTANA_RAFAGA_MS,
} from './rafaga-de-ventas';

const AHORA = new Date('2026-09-11T14:55:00.000Z');
const haceMs = (ms: number) => new Date(AHORA.getTime() - ms);

describe('cuentaParaElTope', () => {
  it('una venta de recién cuenta', () => {
    expect(cuentaParaElTope(haceMs(2_000), AHORA)).toBe(true);
  });

  /**
   * Lo que separa un bucle de una terminal que vuelve de estar offline. La cola
   * sube de golpe —pueden ser cincuenta ventas en dos segundos— y son todas
   * legítimas: ocurrieron hace rato. Frenarlas sería perder ventas reales.
   */
  it('una venta vieja NO cuenta: viene de la cola de una terminal offline', () => {
    expect(cuentaParaElTope(haceMs(VENTANA_RAFAGA_MS + 1), AHORA)).toBe(false);
    expect(cuentaParaElTope(haceMs(3 * 60 * 60 * 1000), AHORA)).toBe(false);
  });

  it('el borde exacto de la ventana ya no cuenta', () => {
    expect(cuentaParaElTope(haceMs(VENTANA_RAFAGA_MS), AHORA)).toBe(false);
  });
});

describe('esRafagaAnormal', () => {
  it('un ritmo de caja real pasa sin problema', () => {
    // Una caja rápida hace 6 a 10 ventas por minuto con el cliente adelante.
    expect(esRafagaAnormal(10)).toBe(false);
    expect(esRafagaAnormal(TOPE_VENTAS_POR_MINUTO - 1)).toBe(false);
  });

  it('en el tope ya frena', () => {
    expect(esRafagaAnormal(TOPE_VENTAS_POR_MINUTO)).toBe(true);
  });

  it('el ritmo del bucle del 11/9 frena', () => {
    // Fueron unas 40 por minuto: Facturas B 5881 a 5921 en un minuto.
    expect(esRafagaAnormal(40)).toBe(true);
  });
});

describe('motivoRafaga', () => {
  it('dice cuántas fueron, qué hacer, y que lo emitido está bien', () => {
    const motivo = motivoRafaga(42);

    expect(motivo).toContain('42');
    expect(motivo).toContain('ARCA');
    // Lo peor que puede hacer este mensaje es dejar la duda de si se perdió algo.
    expect(motivo).toContain('ya emitidas están bien');
    expect(motivo).toContain('avisanos');
  });
});
