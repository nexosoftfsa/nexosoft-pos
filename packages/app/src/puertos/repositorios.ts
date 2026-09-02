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

/**
 * Lo que el servidor resolvió de una venta que se subió: el número que asignó
 * ARCA y el CAE. Lo escribe la terminal sobre su copia local para que un
 * comprobante se pueda ver y reimprimir bien aunque después no haya red.
 */
export interface ResueltoPorElServidor {
  /** Número que asignó ARCA. `null` si todavía no lo autorizó. */
  readonly numeroFiscal: number | null;
  readonly tipoComprobante: string | null;
  readonly cae: string | null;
  readonly vencimientoCae: Date | null;
  /** `AUTORIZADA`, `PENDIENTE`, `RECHAZADA` o `NO_APLICA`. */
  readonly estadoFiscal: string;
}

/** Una venta guardada en la terminal, para listarla sin conexión. */
export interface VentaLocal {
  readonly id: string;
  readonly fecha: Date;
  readonly puntoDeVenta: number;
  /** Correlativo local de la terminal: la referencia interna, no el fiscal. */
  readonly numero: number;
  /** El que asignó ARCA. `null` mientras no esté autorizada. */
  readonly numeroFiscal: number | null;
  readonly tipoComprobante: string;
  readonly estadoCae: string;
  readonly cae: string | null;
  readonly vencimientoCae: Date | null;
  readonly totalCentavos: number;
  readonly descuentoCentavos: number;
  readonly items: readonly VentaLocalItem[];
  readonly pagos: readonly VentaLocalPago[];
}

export interface VentaLocalItem {
  readonly descripcion: string;
  readonly cantidad: string;
  readonly precioUnitarioCentavos: number;
  readonly importeCentavos: number;
}

export interface VentaLocalPago {
  readonly forma: string;
  readonly montoCentavos: number;
}

export interface RepositorioVentas {
  guardar(venta: VentaConfirmada): Promise<void>;
  /** Persiste el resultado de la autorización (estado de CAE, CAE y vencimiento). */
  actualizarCae(venta: VentaConfirmada): Promise<void>;
  /** Próximo número correlativo para un punto de venta y tipo de comprobante. */
  siguienteNumero(puntoDeVenta: number, tipo: TipoComprobante): Promise<number>;
  /** Deja anotado con qué operación de la cola viaja esta venta. */
  vincularOperacion(ventaId: string, operacionId: string): Promise<void>;
  /** Vuelca sobre la venta local lo que resolvió el servidor. */
  aplicarResueltoPorElServidor(
    operacionId: string,
    resuelto: ResueltoPorElServidor,
  ): Promise<void>;
  /** Las últimas ventas de esta terminal, para verlas sin conexión. */
  ultimas(limite: number): Promise<readonly VentaLocal[]>;
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
