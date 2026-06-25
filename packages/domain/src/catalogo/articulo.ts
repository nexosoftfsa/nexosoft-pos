/**
 * `Articulo`: ítem del catálogo.
 *
 * El **costo se guarda neto (sin IVA)** y la `alicuotaIva` del artículo. A partir
 * de ahí se deriva el precio de venta según el régimen del emisor (ver
 * `catalogo/precios.ts` y ADR-0014). Esto refina el boceto de `arquitectura.md`
 * (que lo llamaba `costoBruto`): elegimos neto porque es la base de marcación.
 */
import { nuevoId } from "../comun/id.js";
import { ErrorDominio } from "../comun/errores.js";
import type { AlicuotaIva } from "../fiscal/alicuota-iva.js";
import { Money } from "../dinero/money.js";
import { UnidadDeMedida } from "./unidad-de-medida.js";

export interface Articulo {
  readonly id: string;
  readonly codigoInterno: string;
  readonly codigoBarras?: string;
  readonly descripcion: string;
  readonly rubroId?: string;
  readonly proveedorId?: string;
  readonly unidadDeMedida: UnidadDeMedida;
  /** Costo de reposición SIN IVA. */
  readonly costoNeto: Money;
  readonly alicuotaIva: AlicuotaIva;
  readonly activo: boolean;
}

export interface DatosNuevoArticulo {
  readonly codigoInterno: string;
  readonly descripcion: string;
  readonly unidadDeMedida: UnidadDeMedida;
  readonly costoNeto: Money;
  readonly alicuotaIva: AlicuotaIva;
  readonly codigoBarras?: string;
  readonly rubroId?: string;
  readonly proveedorId?: string;
  /** Si no se indica, se genera. */
  readonly id?: string;
  /** Por defecto `true`. */
  readonly activo?: boolean;
}

/**
 * Crea un `Articulo` validando sus invariantes.
 *
 * @throws {ErrorDominio} si el código o la descripción están vacíos, o el costo
 *   es negativo.
 */
export function crearArticulo(datos: DatosNuevoArticulo): Articulo {
  const codigoInterno = datos.codigoInterno.trim();
  if (codigoInterno === "") {
    throw new ErrorDominio("ARTICULO_SIN_CODIGO", "El artículo necesita un código interno.");
  }
  const descripcion = datos.descripcion.trim();
  if (descripcion === "") {
    throw new ErrorDominio("ARTICULO_SIN_DESCRIPCION", "El artículo necesita una descripción.");
  }
  if (datos.costoNeto.esNegativo()) {
    throw new ErrorDominio(
      "ARTICULO_COSTO_NEGATIVO",
      `El costo no puede ser negativo (artículo "${descripcion}").`,
    );
  }

  const codigoBarras = datos.codigoBarras?.trim();

  return {
    id: datos.id ?? nuevoId(),
    codigoInterno,
    descripcion,
    unidadDeMedida: datos.unidadDeMedida,
    costoNeto: datos.costoNeto,
    alicuotaIva: datos.alicuotaIva,
    activo: datos.activo ?? true,
    ...(codigoBarras !== undefined && codigoBarras !== "" ? { codigoBarras } : {}),
    ...(datos.rubroId !== undefined ? { rubroId: datos.rubroId } : {}),
    ...(datos.proveedorId !== undefined ? { proveedorId: datos.proveedorId } : {}),
  };
}

/** Devuelve una copia del artículo dado de baja (no se borra del catálogo). */
export function desactivarArticulo(articulo: Articulo): Articulo {
  return { ...articulo, activo: false };
}
