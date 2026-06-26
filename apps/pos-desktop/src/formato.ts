import { TipoComprobante, type Money } from "@nexosoft/domain";

/** Formatea un `Money` al estilo argentino: `$ 1.850,00`. */
export function pesos(m: Money): string {
  const s = m.aDecimalString(2);
  const negativo = s.startsWith("-");
  const [entero = "0", decimal = "00"] = s.replace("-", "").split(".");
  const conMiles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negativo ? "-" : ""}$ ${conMiles},${decimal}`;
}

const ETIQUETAS: Partial<Record<TipoComprobante, string>> = {
  [TipoComprobante.FacturaA]: "Factura A",
  [TipoComprobante.FacturaB]: "Factura B",
  [TipoComprobante.FacturaC]: "Factura C",
  [TipoComprobante.NotaCreditoA]: "Nota de Crédito A",
  [TipoComprobante.NotaCreditoB]: "Nota de Crédito B",
  [TipoComprobante.NotaCreditoC]: "Nota de Crédito C",
};

/** Etiqueta legible de un tipo de comprobante. */
export function etiquetaComprobante(tipo: TipoComprobante): string {
  return ETIQUETAS[tipo] ?? tipo;
}
