/**
 * `Deposito`: ubicación física de stock (depósito, trastienda, góndola).
 * Pertenece a una sucursal. En el MVP hay una sola sucursal (ADR-0005), pero el
 * modelo ya separa el depósito para crecer a multi-sucursal sin migrar datos.
 */
import { ErrorDominio } from "../comun/errores.js";
import { nuevoId } from "../comun/id.js";

export interface Deposito {
  readonly id: string;
  readonly nombre: string;
  readonly sucursalId?: string;
}

export interface DatosNuevoDeposito {
  readonly nombre: string;
  readonly sucursalId?: string;
  readonly id?: string;
}

export function crearDeposito(datos: DatosNuevoDeposito): Deposito {
  const nombre = datos.nombre.trim();
  if (nombre === "") {
    throw new ErrorDominio("DEPOSITO_SIN_NOMBRE", "El depósito necesita un nombre.");
  }
  return {
    id: datos.id ?? nuevoId(),
    nombre,
    ...(datos.sucursalId !== undefined ? { sucursalId: datos.sucursalId } : {}),
  };
}
