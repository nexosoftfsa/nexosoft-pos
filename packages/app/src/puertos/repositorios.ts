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
  Cantidad,
  Existencia,
  MovimientoDeStock,
  PrecioArticulo,
  TipoComprobante,
} from "@nexosoft/domain";

import type { VentaConfirmada } from "../ventas/venta.js";

export interface RepositorioArticulos {
  obtener(id: string): Promise<Articulo | undefined>;
}

/** Un componente de un combo: qué artículo entra y en qué cantidad por combo. */
export interface ComponenteDeCombo {
  readonly articuloId: string;
  readonly cantidad: Cantidad;
}

/**
 * Combos (Fase 8.1.b): mapea un artículo COMBO a los componentes cuyo stock se
 * descuenta al venderlo. Devuelve vacío si el artículo no es un combo, de modo
 * que la venta lo trate como un producto simple.
 */
export interface RepositorioCombos {
  componentesDe(articuloId: string): Promise<readonly ComponenteDeCombo[]>;
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
  /** Persiste el resultado de la autorización (estado de CAE, CAE y vencimiento). */
  actualizarCae(venta: VentaConfirmada): Promise<void>;
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
  /** Opcional: si está presente, la venta expande combos a sus componentes. */
  readonly combos?: RepositorioCombos;
}
