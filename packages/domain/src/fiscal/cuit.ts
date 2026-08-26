/**
 * CUIT: normalización y validación del dígito verificador.
 *
 * Vive en el dominio porque lo necesitan los dos lados: el POS al cargar los
 * datos del comercio y el servidor al armar el pedido de certificado de ARCA.
 *
 * Validar el dígito verificador acá importa más de lo que parece: un CUIT mal
 * tipeado produce un certificado que no autentica contra nada, y eso se
 * descubre recién al primer intento de facturar — cuando el comercio ya está
 * vendiendo y esperando el CAE.
 */

/** Pesos del algoritmo de verificación (módulo 11) sobre los 10 primeros dígitos. */
const PESOS: readonly number[] = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** Deja solo los dígitos: acepta "20-35678007-9", "20356780079" o con espacios. */
export function normalizarCuit(cuit: string): string {
  return cuit.replace(/\D/g, "");
}

/** `true` si son 11 dígitos y el último es el verificador correcto. */
export function cuitEsValido(cuit: string): boolean {
  const digitos = normalizarCuit(cuit);
  if (!/^\d{11}$/.test(digitos)) return false;

  let suma = 0;
  for (let i = 0; i < 10; i++) {
    suma += Number(digitos[i]) * (PESOS[i] as number);
  }
  const resto = suma % 11;
  let verificador = 11 - resto;
  if (verificador === 11) verificador = 0;
  if (verificador === 10) verificador = 9;
  return Number(digitos[10]) === verificador;
}

/** Formato legible `20-35678007-9`. Devuelve lo recibido si no son 11 dígitos. */
export function formatearCuit(cuit: string): string {
  const d = normalizarCuit(cuit);
  if (d.length !== 11) return cuit;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}
