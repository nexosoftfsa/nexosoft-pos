/**
 * Qué le falta a una venta para poder emitirse.
 *
 * Es una función pura y vive aparte de la pantalla porque la regla es fiscal,
 * no de interfaz: una Factura A **es** una factura a un CUIT identificado. Sin
 * receptor no es una A incompleta, no es una A.
 *
 * Hasta ahora nada lo impedía: el selector de "receptor" y el selector de
 * "cliente" eran independientes, así que poner el receptor en Responsable
 * Inscripto sin elegir cliente armaba una Factura A dirigida a consumidor
 * final. En la prueba del 6/9/2026 salió una así — el ticket imprimió "Factura
 * A" sin ningún dato del receptor — y ARCA la habría rechazado.
 */
import { cuitEsValido, letraDe, normalizarCuit, TipoComprobante } from "@nexosoft/domain";

import type { ClienteVenta } from "./PantallaPos";

/**
 * `null` si la venta se puede emitir; si no, qué le falta, en un mensaje que
 * pueda leer el cajero mientras el cliente espera.
 */
export function motivoNoFacturable(
  tipo: TipoComprobante,
  cliente: ClienteVenta | undefined,
): string | null {
  if (tipo === TipoComprobante.TicketNoFiscal) return null;
  if (letraDe(tipo) !== "A") return null;

  if (cliente === undefined) {
    return "Una Factura A necesita un cliente con CUIT. Elegí el cliente arriba, o cambiá el receptor a Consumidor Final para emitir una B.";
  }
  const documento = cliente.documento ?? "";
  if (!cuitEsValido(normalizarCuit(documento))) {
    return `El cliente "${cliente.nombre}" no tiene un CUIT válido cargado, y una Factura A lo exige. Corregilo en Clientes, o cambiá el receptor a Consumidor Final para emitir una B.`;
  }
  return null;
}
