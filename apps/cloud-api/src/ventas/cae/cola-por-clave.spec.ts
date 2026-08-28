import { describe, expect, it } from 'vitest';

import { ColaPorClave } from './cola-por-clave';

/** Una tarea que se puede resolver a mano, para controlar el orden. */
function tareaControlada() {
  let resolver!: (v: string) => void;
  let rechazar!: (e: Error) => void;
  const promesa = new Promise<string>((res, rej) => {
    resolver = res;
    rechazar = rej;
  });
  return { promesa, resolver, rechazar };
}

describe('ColaPorClave', () => {
  it('no deja que dos tareas de la misma clave corran a la vez', async () => {
    const cola = new ColaPorClave();
    const eventos: string[] = [];
    const primera = tareaControlada();

    const a = cola.enFila('4:6', async () => {
      eventos.push('entra A');
      const v = await primera.promesa;
      eventos.push('sale A');
      return v;
    });
    const b = cola.enFila('4:6', async () => {
      eventos.push('entra B');
      return 'B';
    });

    // B no puede haber empezado: A todavía está adentro.
    await Promise.resolve();
    expect(eventos).toEqual(['entra A']);

    primera.resolver('A');
    await expect(a).resolves.toBe('A');
    await expect(b).resolves.toBe('B');
    expect(eventos).toEqual(['entra A', 'sale A', 'entra B']);
  });

  it('deja correr en paralelo las claves distintas', async () => {
    // Dos cajas facturando tipos distintos no tienen por qué esperarse: ARCA
    // exige correlatividad por punto de venta y tipo, no en general.
    const cola = new ColaPorClave();
    const eventos: string[] = [];
    const bloqueada = tareaControlada();

    const a = cola.enFila('4:6', async () => {
      eventos.push('entra B');
      return bloqueada.promesa;
    });
    const b = cola.enFila('4:11', async () => {
      eventos.push('entra C');
      return 'C';
    });

    await expect(b).resolves.toBe('C');
    expect(eventos).toEqual(['entra B', 'entra C']);

    bloqueada.resolver('B');
    await expect(a).resolves.toBe('B');
  });

  it('una tarea que falla no traba la fila', async () => {
    // Si ARCA rechaza un comprobante, la venta siguiente tiene que poder pedir
    // su CAE igual. Una fila trabada dejaría al comercio sin facturar.
    const cola = new ColaPorClave();

    const falla = cola.enFila('4:6', () => Promise.reject(new Error('ARCA rechazó')));
    await expect(falla).rejects.toThrow('ARCA rechazó');

    await expect(cola.enFila('4:6', () => Promise.resolve('sigue andando'))).resolves.toBe(
      'sigue andando',
    );
  });

  it('respeta el orden de llegada', async () => {
    const cola = new ColaPorClave();
    const orden: number[] = [];
    await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        cola.enFila('4:6', async () => {
          orden.push(n);
        }),
      ),
    );
    expect(orden).toEqual([1, 2, 3, 4, 5]);
  });
});
