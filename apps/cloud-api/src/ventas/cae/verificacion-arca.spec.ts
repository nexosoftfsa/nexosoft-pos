import { describe, expect, it } from 'vitest';

import { compararConArca } from './verificacion-arca';

const BASE = {
  entorno: 'homologacion' as const,
  puntoDeVenta: 2,
  numero: 91,
};

const EN_ARCA = {
  cae: '86350824857695',
  caeFechaVto: new Date(2026, 8, 7),
  numero: 91,
  observaciones: [],
  importeTotal: '1100.00',
};

describe('compararConArca', () => {
  it('confirma cuando ARCA coincide con lo nuestro', () => {
    const r = compararConArca({
      ...BASE,
      enArca: EN_ARCA,
      local: { cae: '86350824857695', total: '1100.00' },
    });

    expect(r.estado).toBe('AUTORIZADO');
    expect(r.mensaje).toContain('0002-00000091');
    expect(r.mensaje).toContain('86350824857695');
    expect(r.diferencias).toEqual([]);
  });

  it('en homologación aclara que no tiene validez fiscal', () => {
    // Si no se dice, un CAE de homologación se lee como una factura de verdad.
    const r = compararConArca({
      ...BASE,
      enArca: EN_ARCA,
      local: { cae: EN_ARCA.cae, total: '1100.00' },
    });
    expect(r.mensaje).toContain('no tiene validez fiscal');
    expect(r.mensaje).toContain('no aparece en las páginas públicas');
  });

  it('en producción no mete esa aclaración', () => {
    const r = compararConArca({
      ...BASE,
      entorno: 'produccion',
      enArca: EN_ARCA,
      local: { cae: EN_ARCA.cae, total: '1100.00' },
    });
    expect(r.mensaje).toContain('producción');
    expect(r.mensaje).not.toContain('validez fiscal');
  });

  it('avisa si ARCA lo tiene por otro importe', () => {
    // El caso grave: el ticket que tiene el cliente dice un número y ARCA
    // registró otro. Sin comparar no se veria nunca.
    const r = compararConArca({
      ...BASE,
      enArca: EN_ARCA,
      local: { cae: EN_ARCA.cae, total: '1500.00' },
    });

    expect(r.estado).toBe('DIFIERE');
    expect(r.diferencias[0]).toContain('1500.00');
    expect(r.diferencias[0]).toContain('1100.00');
  });

  it('avisa si el CAE guardado no es el que tiene ARCA', () => {
    const r = compararConArca({
      ...BASE,
      enArca: EN_ARCA,
      local: { cae: '11111111111111', total: '1100.00' },
    });

    expect(r.estado).toBe('DIFIERE');
    expect(r.diferencias[0]).toContain('11111111111111');
  });

  it('no se queja por como venga escrito el importe', () => {
    const r = compararConArca({
      ...BASE,
      enArca: { ...EN_ARCA, importeTotal: '1100' },
      local: { cae: EN_ARCA.cae, total: '1100.00' },
    });
    expect(r.estado).toBe('AUTORIZADO');
  });

  it('si ARCA no lo tiene y nosotros tampoco, es coherente', () => {
    const r = compararConArca({ ...BASE, enArca: null, local: { cae: null, total: '1100.00' } });

    expect(r.estado).toBe('NO_ESTA');
    expect(r.mensaje).toContain('es coherente');
  });

  it('si ARCA no lo tiene pero acá figura con CAE, hay que revisarlo', () => {
    // Esto seria un comprobante que creemos autorizado y ARCA desconoce.
    const r = compararConArca({
      ...BASE,
      enArca: null,
      local: { cae: '86350824857695', total: '1100.00' },
    });

    expect(r.estado).toBe('NO_ESTA');
    expect(r.mensaje).toContain('hay que revisarlo');
  });
});
