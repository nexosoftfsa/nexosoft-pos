import { describe, expect, it } from 'vitest';

import { detalleDeRed } from './detalle-de-red';

/** Un `fetch failed` de Node, con la causa real colgada abajo. */
function falloDeFetch(causa: unknown) {
  return Object.assign(new TypeError('fetch failed'), { cause: causa });
}

describe('detalleDeRed', () => {
  it('saca a la luz la causa que fetch esconde', () => {
    // Este es el caso real: el comercio veia "fetch failed" y nadie podia
    // saber si era el DNS, el firewall o el certificado.
    const d = detalleDeRed(
      falloDeFetch(Object.assign(new Error('getaddrinfo ENOTFOUND wsaa.afip.gov.ar'), {
        code: 'ENOTFOUND',
      })),
    );

    expect(d).toContain('fetch failed');
    expect(d).toContain('ENOTFOUND');
    expect(d).toContain('wsaa.afip.gov.ar');
  });

  it('sigue la cadena de causas hasta el fondo', () => {
    const fondo = Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' });
    const medio = Object.assign(new Error('falló la conexión'), { cause: fondo });

    expect(detalleDeRed(falloDeFetch(medio))).toContain('ETIMEDOUT');
  });

  it('junta los dos intentos cuando Node prueba IPv4 e IPv6', () => {
    // Con "happy eyeballs" el error util suele estar en el sub-error de IPv6.
    const agregado = Object.assign(new AggregateError([], 'todos fallaron'), {
      errors: [
        Object.assign(new Error('connect ECONNREFUSED 1.2.3.4:443'), { code: 'ECONNREFUSED' }),
        Object.assign(new Error('connect ENETUNREACH 2800::1:443'), { code: 'ENETUNREACH' }),
      ],
    });

    const d = detalleDeRed(falloDeFetch(agregado));

    expect(d).toContain('ECONNREFUSED');
    expect(d).toContain('ENETUNREACH');
  });

  it('no repite la misma linea dos veces', () => {
    const repetido = Object.assign(new Error('igual'), {
      cause: Object.assign(new Error('igual'), {}),
    });
    expect(detalleDeRed(repetido)).toBe('igual');
  });

  it('no se cuelga con una cadena circular', () => {
    const a: { message: string; cause?: unknown } = { message: 'a' };
    const b = { message: 'b', cause: a };
    a.cause = b;

    expect(() => detalleDeRed(a)).not.toThrow();
  });

  it('con algo que no es un Error devuelve lo que haya', () => {
    expect(detalleDeRed('se rompio todo')).toBe('se rompio todo');
  });
});
