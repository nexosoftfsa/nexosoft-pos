/**
 * Listas de precios (minorista, mayorista, personalizada) y el precio de un
 * artículo dentro de una lista.
 *
 * Un `PrecioArticulo` puede ser **manual** (un `Money` fijo) o por **margen**
 * (se deriva del costo del artículo con un % de utilidad; ver `precios.ts`).
 */
import { nuevoId } from "../comun/id.js";
import { ErrorDominio } from "../comun/errores.js";
import type { Money } from "../dinero/money.js";

export const TipoLista = {
  Minorista: "minorista",
  Mayorista: "mayorista",
  Personalizada: "personalizada",
} as const;

export type TipoLista = (typeof TipoLista)[keyof typeof TipoLista];

export interface ListaDePrecios {
  readonly id: string;
  readonly nombre: string;
  readonly tipo: TipoLista;
  /** Lista usada por defecto en el POS (debería haber exactamente una). */
  readonly predeterminada: boolean;
}

export interface DatosNuevaLista {
  readonly nombre: string;
  readonly tipo: TipoLista;
  readonly predeterminada?: boolean;
  readonly id?: string;
}

export function crearListaDePrecios(datos: DatosNuevaLista): ListaDePrecios {
  const nombre = datos.nombre.trim();
  if (nombre === "") {
    throw new ErrorDominio("LISTA_SIN_NOMBRE", "La lista necesita un nombre.");
  }
  return {
    id: datos.id ?? nuevoId(),
    nombre,
    tipo: datos.tipo,
    predeterminada: datos.predeterminada ?? false,
  };
}

export const ModoPrecio = {
  /** Precio cargado a mano. */
  Manual: "manual",
  /** Precio derivado del costo con un % de margen. */
  Margen: "margen",
} as const;

export type ModoPrecio = (typeof ModoPrecio)[keyof typeof ModoPrecio];

export interface PrecioArticulo {
  readonly articuloId: string;
  readonly listaId: string;
  readonly modo: ModoPrecio;
  /** Precio final IVA incluido, si `modo === "manual"`. */
  readonly precioManual?: Money;
  /** Margen de utilidad en %, si `modo === "margen"`. */
  readonly margenUtilidad?: number;
}
