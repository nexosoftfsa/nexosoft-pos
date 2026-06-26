import type { LibroDeVentas, FilaVenta } from './libro-de-ventas';

/** Mock del libro de ventas para tests: acumula filas en memoria. */
export class LibroDeVentasEnMemoria implements LibroDeVentas {
  readonly filas: FilaVenta[] = [];

  registrar(fila: FilaVenta): Promise<void> {
    const idx = this.filas.findIndex((f) => f.operacionId === fila.operacionId);
    if (idx >= 0) {
      this.filas[idx] = fila;
    } else {
      this.filas.push(fila);
    }
    return Promise.resolve();
  }
}
