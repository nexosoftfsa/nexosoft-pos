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
 * ("11.450,00") y la cruda con punto decimal ("11450.00").
 *
 * El caso que decide es "20.000", que desde que el campo separa los miles solo
 * (ver `formatearImporteTecleado`) es lo que se ve mientras se teclea. Sin esta
 * regla `Money.desde` lo leía como veinte pesos.
 */
export function importeTecleado(texto: string): string {
  const v = texto.trim();
  // Con coma, la coma es el decimal y todo punto es separador de miles.
  if (v.includes(",")) return v.replace(/\./g, "").replace(",", ".");
  // Sin coma: un único punto con uno o dos dígitos atrás es la forma cruda
  // ("11450.00", "1.50"); cualquier otra cosa son miles ("20.000", "1.234.567").
  return /^-?\d+\.\d{1,2}$/.test(v) ? v : v.replace(/\./g, "");
}

/** Cuántos dígitos hay en los primeros `posicion` caracteres. */
export function digitosHasta(texto: string, posicion: number): number {
  return (texto.slice(0, posicion).match(/\d/g) ?? []).length;
}

/** Dónde queda el cursor después de `digitos` dígitos del texto formateado. */
export function posicionTrasDigitos(texto: string, digitos: number): number {
  if (digitos === 0) return 0;
  let vistos = 0;
  for (let i = 0; i < texto.length; i++) {
    if (/\d/.test(texto[i] as string)) {
      vistos++;
      if (vistos === digitos) return i + 1;
    }
  }
  return texto.length;
}

/**
 * Lo que se ve en el campo mientras se teclea un importe: "20000" → "20.000".
 *
 * Lo pidió Sebastián, y el motivo está en su propio informe: *"Quise colocar un
 * billete de $ 2.000 y puse $ 20.000 porque ya estoy cansado, con sueño y la
 * máquina de café de mi local no funciona, no puedo contar los ceros sin un
 * separador automático de miles mientras tipeo"*. El campo ya mostraba los
 * miles cuando el importe venía propuesto por el sistema; lo que se tecleaba a
 * mano salía crudo, que es justo cuando hay que poder leerlo.
 *
 * Los puntos que entran se descartan —los miles los pone esta función— y la
 * coma es el decimal, con dos lugares como máximo. La coma sola se conserva: es
 * el estado intermedio de alguien que está por escribir los centavos.
 */
export function formatearImporteTecleado(texto: string): string {
  const limpio = texto.replace(/[^\d,]/g, "");
  const coma = limpio.indexOf(",");
  const enteroCrudo = (coma < 0 ? limpio : limpio.slice(0, coma)).replace(/,/g, "");
  const decimales = coma < 0 ? null : limpio.slice(coma + 1).replace(/,/g, "").slice(0, 2);

  // Sin dígitos enteros no hay nada que agrupar: "" o ",50" mientras se teclea.
  const entero = enteroCrudo.replace(/^0+(?=\d)/, "");
  const conMiles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decimales === null ? conMiles : `${conMiles},${decimales}`;
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
