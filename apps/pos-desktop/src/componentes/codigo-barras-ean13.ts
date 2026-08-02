/**
 * Fase 10.5 (etiquetas de góndola): codificación EAN-13 pura, sin dependencias
 * nuevas — devuelve el patrón de barras como string de '0'/'1' (95 módulos)
 * para renderizar como SVG. Referencia: especificación GS1 EAN-13.
 *
 * Solo códigos NUMÉRICOS de 12 o 13 dígitos son EAN-13 válidos (o completables
 * calculando el dígito verificador). Códigos internos cortos (los del sistema
 * anterior para ítems sin EAN real) no tienen barra: se imprimen como texto.
 */

const L_CODE: Record<string, string> = {
  "0": "0001101", "1": "0011001", "2": "0010011", "3": "0111101", "4": "0100011",
  "5": "0110001", "6": "0101111", "7": "0111011", "8": "0110111", "9": "0001011",
};
const G_CODE: Record<string, string> = {
  "0": "0100111", "1": "0110011", "2": "0011011", "3": "0100001", "4": "0011101",
  "5": "0111001", "6": "0000101", "7": "0010001", "8": "0001001", "9": "0010111",
};
const R_CODE: Record<string, string> = {
  "0": "1110010", "1": "1100110", "2": "1101100", "3": "1000010", "4": "1011100",
  "5": "1001110", "6": "1010000", "7": "1000100", "8": "1001000", "9": "1110100",
};
/** Primer dígito → patrón L/G de los 6 dígitos siguientes (el 1° no se dibuja, se codifica así). */
const PATRON_PARIDAD: Record<string, string> = {
  "0": "LLLLLL", "1": "LLGLGG", "2": "LLGGLG", "3": "LLGGGL", "4": "LGLLGG",
  "5": "LGGLLG", "6": "LGGGLL", "7": "LGLGLG", "8": "LGLGGL", "9": "LGGLGL",
};

const INICIO = "101";
const CENTRO = "01010";
const FIN = "101";

/** Dígito verificador EAN-13 a partir de los primeros 12 dígitos. */
export function digitoVerificadorEan13(doce: string): number {
  let suma = 0;
  for (let i = 0; i < 12; i++) {
    const d = Number(doce[i]);
    suma += i % 2 === 0 ? d : d * 3;
  }
  return (10 - (suma % 10)) % 10;
}

export interface Ean13 {
  /** Los 13 dígitos finales (con el verificador recalculado, no el que traía el dato). */
  readonly digitos: string;
  /** Patrón de barras: 95 caracteres '0'/'1' (INICIO+6L/G+CENTRO+6R+FIN). */
  readonly barras: string;
}

/**
 * Codifica un código como EAN-13. Acepta 12 dígitos (calcula el verificador) o
 * 13 (se ignora el 13° dado y se recalcula, por consistencia). Cualquier otra
 * cosa (no numérico, largo distinto) devuelve `null` — no es un EAN-13.
 */
export function codificarEan13(codigo: string): Ean13 | null {
  const limpio = codigo.trim();
  if (!/^\d{12,13}$/.test(limpio)) return null;

  const doce = limpio.slice(0, 12);
  const verificador = digitoVerificadorEan13(doce);
  const digitos = doce + String(verificador);

  const primero = digitos[0]!;
  const patron = PATRON_PARIDAD[primero]!;
  const izquierda = digitos
    .slice(1, 7)
    .split("")
    .map((d, i) => (patron[i] === "L" ? L_CODE[d]! : G_CODE[d]!))
    .join("");
  const derecha = digitos
    .slice(7, 13)
    .split("")
    .map((d) => R_CODE[d]!)
    .join("");

  return { digitos, barras: INICIO + izquierda + CENTRO + derecha + FIN };
}
