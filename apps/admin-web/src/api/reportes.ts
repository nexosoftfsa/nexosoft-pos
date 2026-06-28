import type { ClienteApi } from "./cliente-http";

/** Rango de fechas para consultar reportes (ambos opcionales: default 30 días). */
export interface RangoFechas {
  desde?: string | undefined;
  hasta?: string | undefined;
}

export interface ResumenVentas {
  desde: string;
  hasta: string;
  cantidadVentas: number;
  totalVendido: string;
  totalDescuentos: string;
  ticketPromedio: string;
}

export interface PuntoSerie {
  fecha: string;
  total: string;
  cantidad: number;
}

export interface VentasPorMedioPago {
  medioPago: string;
  total: string;
  cantidad: number;
}

export interface VentasPorTerminal {
  terminalId: string;
  nombre: string;
  total: string;
  cantidad: number;
}

/** Convierte el rango en query params, omitiendo lo que no esté definido. */
function aQuery(rango: RangoFechas): Record<string, string | undefined> {
  return { desde: rango.desde, hasta: rango.hasta };
}

export const reportes = {
  resumenVentas: (api: ClienteApi, rango: RangoFechas) =>
    api.get<ResumenVentas>("/reportes/ventas/resumen", aQuery(rango)),

  serieDiaria: (api: ClienteApi, rango: RangoFechas) =>
    api.get<PuntoSerie[]>("/reportes/ventas/serie", aQuery(rango)),

  porMedioPago: (api: ClienteApi, rango: RangoFechas) =>
    api.get<VentasPorMedioPago[]>("/reportes/ventas/por-medio-pago", aQuery(rango)),

  porTerminal: (api: ClienteApi, rango: RangoFechas) =>
    api.get<VentasPorTerminal[]>("/reportes/ventas/por-terminal", aQuery(rango)),
};
