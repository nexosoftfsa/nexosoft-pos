/**
 * Vuelca sobre las ventas de la terminal lo que el servidor resolvió de cada
 * operación sincronizada: el número que asignó ARCA y el CAE.
 *
 * Hace falta porque el POS guarda la venta apenas ocurre —con un correlativo
 * LOCAL y sin CAE, que es todo lo que se puede saber sin red— y recién después
 * la sube. Sin este paso, la copia local de una venta se queda para siempre
 * "pendiente de autorización" aunque ARCA ya la haya autorizado, y eso se ve
 * apenas se abre Comprobantes sin conexión.
 *
 * Nunca rompe la sincronización: si falla escribir en la base local, la venta
 * ya está subida y bien registrada en el servidor, que es lo que importa.
 */
import type { RepositorioVentas } from "@nexosoft/app";
import type { ResumenSync } from "@nexosoft/sync";

export async function volcarComprobantes(
  ventas: RepositorioVentas,
  resultados: ResumenSync["resultados"],
): Promise<void> {
  for (const [operacionId, resultado] of Object.entries(resultados)) {
    const c = resultado.ok ? resultado.comprobante : undefined;
    if (c === undefined) continue;
    await ventas.aplicarResueltoPorElServidor(operacionId, {
      numeroFiscal: c.numeroComprobante,
      tipoComprobante: c.tipoComprobante,
      cae: c.cae,
      vencimientoCae: c.caeFechaVto === null ? null : new Date(c.caeFechaVto),
      estadoFiscal: c.estadoFiscal,
    });
  }
}
