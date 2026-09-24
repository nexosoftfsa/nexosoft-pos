import { TipoComprobante, type Money } from "@nexosoft/domain";

/** Formatea un `Money` al estilo argentino: `$ 1.850,00`. */
export function pesos(m: Money): string {
  const s = m.aDecimalString(2);
  const negativo = s.startsWith("-");
  const [entero = "0", decimal = "00"] = s.replace("-", "").split(".");
  const conMiles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negativo ? "-" : ""}$ ${conMiles},${decimal}`;
}

/**
 * Un importe listo para EDITAR: "11.450,00", sin el signo pesos.
 *
 * Lo pidió Sebastián después de tener que contar ceros en el campo de monto
 * del asistente, donde el saldo salía crudo —"11450.00"— y a simple vista
 * 10000 y 1000 se parecen demasiado. En un campo donde el cajero confirma
 * cuánta plata entra, eso es un error esperando a pasar.
 */
export function importeParaEditar(m: Money): string {
  return pesos(m).replace("$", "").trim();
}

/**
 * Lo que tecleó el cajero, en el formato que entiende `Money.desde`.
 *
 * Acepta las dos formas: la de es-AR con punto de miles y coma decimal
 * ("11.450,00") y la cruda con punto decimal ("11450.00"). La coma es la que
 * decide: si está, los puntos son separadores de miles y se sacan.
 */
export function importeTecleado(texto: string): string {
  const v = texto.trim();
  return v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
}

const ETIQUETAS: Partial<Record<TipoComprobante, string>> = {
  [TipoComprobante.FacturaA]: "Factura A",
  [TipoComprobante.FacturaB]: "Factura B",
  [TipoComprobante.FacturaC]: "Factura C",
  [TipoComprobante.NotaCreditoA]: "Nota de Crédito A",
  [TipoComprobante.NotaCreditoB]: "Nota de Crédito B",
  [TipoComprobante.NotaCreditoC]: "Nota de Crédito C",
  [TipoComprobante.TicketNoFiscal]: "Ticket",
};

/** Etiqueta legible de un tipo de comprobante. */
export function etiquetaComprobante(tipo: TipoComprobante): string {
  return ETIQUETAS[tipo] ?? tipo;
}
