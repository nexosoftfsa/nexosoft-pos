/**
 * Adaptadores de repositorio **en memoria**: para tests y para correr la lógica
 * sin base real. Implementan los mismos puertos que usará el adaptador SQLite del
 * POS (Fase 1.4b), por lo que el servicio de venta no cambia al pasar a SQLite.
 */
import type {
  Articulo,
  Existencia,
  MovimientoDeStock,
  PrecioArticulo,
  TipoComprobante,
} from "@nexosoft/domain";

import type {
  ComponenteDeCombo,
  Repositorios,
  RepositorioArticulos,
  RepositorioCombos,
  RepositorioExistencias,
  RepositorioMovimientos,
  RepositorioPrecios,
  RepositorioVentas,
} from "../puertos/repositorios.js";
import type { VentaConfirmada } from "../ventas/venta.js";

const clavePrecio = (articuloId: string, listaId: string): string => `${articuloId}::${listaId}`;
const claveExistencia = (articuloId: string, depositoId: string): string =>
  `${articuloId}::${depositoId}`;

export class RepositorioArticulosMemoria implements RepositorioArticulos {
  private readonly datos = new Map<string, Articulo>();
  constructor(articulos: readonly Articulo[] = []) {
    for (const a of articulos) this.datos.set(a.id, a);
  }
  async obtener(id: string): Promise<Articulo | undefined> {
    return this.datos.get(id);
  }
}

export class RepositorioPreciosMemoria implements RepositorioPrecios {
  private readonly datos = new Map<string, PrecioArticulo>();
  constructor(precios: readonly PrecioArticulo[] = []) {
    for (const p of precios) this.datos.set(clavePrecio(p.articuloId, p.listaId), p);
  }
  async obtener(articuloId: string, listaId: string): Promise<PrecioArticulo | undefined> {
    return this.datos.get(clavePrecio(articuloId, listaId));
  }
}

export class RepositorioExistenciasMemoria implements RepositorioExistencias {
  private readonly datos = new Map<string, Existencia>();
  constructor(existencias: readonly Existencia[] = []) {
    for (const e of existencias) this.datos.set(claveExistencia(e.articuloId, e.depositoId), e);
  }
  async obtener(articuloId: string, depositoId: string): Promise<Existencia | undefined> {
    return this.datos.get(claveExistencia(articuloId, depositoId));
  }
  async guardar(existencia: Existencia): Promise<void> {
    this.datos.set(claveExistencia(existencia.articuloId, existencia.depositoId), existencia);
  }
}

export class RepositorioMovimientosMemoria implements RepositorioMovimientos {
  readonly movimientos: MovimientoDeStock[] = [];
  async agregar(movimiento: MovimientoDeStock): Promise<void> {
    this.movimientos.push(movimiento);
  }
}

export class RepositorioCombosMemoria implements RepositorioCombos {
  private readonly datos = new Map<string, readonly ComponenteDeCombo[]>();
  constructor(combos: ReadonlyMap<string, readonly ComponenteDeCombo[]> = new Map()) {
    for (const [id, comps] of combos) this.datos.set(id, comps);
  }
  async componentesDe(articuloId: string): Promise<readonly ComponenteDeCombo[]> {
    return this.datos.get(articuloId) ?? [];
  }
}

export class RepositorioVentasMemoria implements RepositorioVentas {
  readonly ventas: VentaConfirmada[] = [];
  private readonly numeradores = new Map<string, number>();
  async guardar(venta: VentaConfirmada): Promise<void> {
    this.ventas.push(venta);
  }
  async actualizarCae(venta: VentaConfirmada): Promise<void> {
    const i = this.ventas.findIndex((v) => v.id === venta.id);
    if (i >= 0) this.ventas[i] = venta;
  }
  async siguienteNumero(puntoDeVenta: number, tipo: TipoComprobante): Promise<number> {
    const clave = `${puntoDeVenta}::${tipo}`;
    const siguiente = (this.numeradores.get(clave) ?? 0) + 1;
    this.numeradores.set(clave, siguiente);
    return siguiente;
  }
}

export interface SemillaMemoria {
  readonly articulos?: readonly Articulo[];
  readonly precios?: readonly PrecioArticulo[];
  readonly existencias?: readonly Existencia[];
  /** Mapa `articuloId del combo → componentes`. */
  readonly combos?: ReadonlyMap<string, readonly ComponenteDeCombo[]>;
}

export interface RepositoriosMemoria extends Repositorios {
  readonly articulos: RepositorioArticulosMemoria;
  readonly precios: RepositorioPreciosMemoria;
  readonly existencias: RepositorioExistenciasMemoria;
  readonly movimientos: RepositorioMovimientosMemoria;
  readonly ventas: RepositorioVentasMemoria;
  readonly combos: RepositorioCombosMemoria;
}

/** Arma un juego de repositorios en memoria con datos de semilla opcionales. */
export function crearRepositoriosMemoria(semilla: SemillaMemoria = {}): RepositoriosMemoria {
  return {
    articulos: new RepositorioArticulosMemoria(semilla.articulos),
    precios: new RepositorioPreciosMemoria(semilla.precios),
    existencias: new RepositorioExistenciasMemoria(semilla.existencias),
    movimientos: new RepositorioMovimientosMemoria(),
    ventas: new RepositorioVentasMemoria(),
    combos: new RepositorioCombosMemoria(semilla.combos),
  };
}
