import { describe, expect, it } from 'vitest';

import { condicionIvaReceptorArca, receptorArca, RECEPTOR_CONSUMIDOR_FINAL } from './receptor-arca';

describe('receptorArca', () => {
  it('sin documento va como consumidor final', () => {
    // El caso normal del mostrador.
    expect(receptorArca(null)).toEqual(RECEPTOR_CONSUMIDOR_FINAL);
    expect(receptorArca('')).toEqual(RECEPTOR_CONSUMIDOR_FINAL);
    expect(receptorArca(undefined)).toEqual({
      tipoDocReceptor: 99,
      nroDocReceptor: '0',
      condicionIvaReceptor: 5,
    });
  });

  it('un CUIT válido va como CUIT, con o sin guiones', () => {
    expect(receptorArca('30-71234567-1', 'RESPONSABLE_INSCRIPTO')).toEqual({
      tipoDocReceptor: 80,
      nroDocReceptor: '30712345671',
      condicionIvaReceptor: 1,
    });
    expect(receptorArca('30712345671', 'RESPONSABLE_INSCRIPTO')).toEqual({
      tipoDocReceptor: 80,
      nroDocReceptor: '30712345671',
      condicionIvaReceptor: 1,
    });
  });

  it('la condición del receptor se manda siempre (RG 5616)', () => {
    // Omitirla es rechazo: ARCA la exige en el comprobante.
    expect(condicionIvaReceptorArca('RESPONSABLE_INSCRIPTO')).toBe(1);
    expect(condicionIvaReceptorArca('EXENTO')).toBe(4);
    expect(condicionIvaReceptorArca('MONOTRIBUTO')).toBe(6);
    expect(condicionIvaReceptorArca('CONSUMIDOR_FINAL')).toBe(5);
    expect(condicionIvaReceptorArca(null)).toBe(5);
  });

  it('un cliente identificado conserva su condición aunque el documento no sirva', () => {
    expect(receptorArca('123', 'MONOTRIBUTO')).toEqual({
      tipoDocReceptor: 99,
      nroDocReceptor: '0',
      condicionIvaReceptor: 6,
    });
  });

  it('un CUIT con dígito verificador malo NO se manda como CUIT', () => {
    // Mejor emitir a consumidor final que comerse un rechazo de ARCA por un
    // dato cargado a los apurones.
    expect(receptorArca('30-71234567-9')).toEqual(RECEPTOR_CONSUMIDOR_FINAL);
  });

  it('un DNI va como DNI', () => {
    expect(receptorArca('25123456')).toEqual({
      tipoDocReceptor: 96,
      nroDocReceptor: '25123456',
      condicionIvaReceptor: 5,
    });
    expect(receptorArca('5123456')).toEqual({
      tipoDocReceptor: 96,
      nroDocReceptor: '5123456',
      condicionIvaReceptor: 5,
    });
  });

  it('cualquier otra cosa cae en consumidor final', () => {
    expect(receptorArca('123')).toEqual(RECEPTOR_CONSUMIDOR_FINAL);
    expect(receptorArca('sin datos')).toEqual(RECEPTOR_CONSUMIDOR_FINAL);
  });
});
