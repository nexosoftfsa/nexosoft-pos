/**
 * Puertos de persistencia (interfaces). La capa de aplicación depende de estos
 * contratos, nunca de una base concreta. Los adaptadores los implementan:
 *  - en memoria (tests y prototipo) — ver `memoria/repositorios-memoria.ts`;
 *  - SQLite local en el POS (Tauri) — Fase 1.4b;
 *  - PostgreSQL en el backend — más adelante.
 *
 * Son asincrónicos porque la persistencia real (SQLite/Tauri, Postgres) lo es.
 */
import type {
  Articulo,
  Existencia,
  MovimientoDeStock,
  PrecioArticulo,
  TipoComprobante,
} from "@nexosoft/domain";

import type { VentaConfirmada } from "../ventas/venta.js";

export interface RepositorioArticulos {
  obtener(id: string): Promise<Articulo | undefined>;
}

export interface RepositorioPrecios {
  obtener(articuloId: string, listaId: string): Promise<PrecioArticulo | undefined>;
}

export interface RepositorioExistencias {
  obtener(articuloId: string, depositoId: string): Promise<Existencia | undefined>;
  guardar(existencia: Existencia): Promise<void>;
}

export interface RepositorioMovimientos {
  agregar(movimiento: MovimientoDeStock): Promise<void>;
}

export interface RepositorioVentas {
  guardar(venta: VentaConfirmada): Promise<void>;
  /** Próximo número correlativo para un punto de venta y tipo de comprobante. */
  siguienteNumero(puntoDeVenta: number, tipo: TipoComprobante): Promise<number>;
}

/** Conjunto de repositorios que necesita la capa de aplicación. */
export interface Repositorios {
  readonly articulos: RepositorioArticulos;
  readonly precios: RepositorioPrecios;
  readonly existencias: RepositorioExistencias;
  readonly movimientos: RepositorioMovimientos;
  readonly ventas: RepositorioVentas;
}
