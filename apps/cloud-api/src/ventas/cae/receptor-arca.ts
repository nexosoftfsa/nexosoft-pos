import { cuitEsValido, normalizarCuit } from '@nexosoft/domain';

/** `DocTipo`/`DocNro`/`CondicionIVAReceptorId` de WSFEv1. */
export interface ReceptorArca {
  readonly tipoDocReceptor: number;
  readonly nroDocReceptor: string;
  /** `CondicionIVAReceptorId` (RG 5616/2024). */
  readonly condicionIvaReceptor: number;
}

/**
 * `CondicionIVAReceptorId` de ARCA (tabla `FEParamGetCondicionIvaReceptor`).
 *
 * La RG 5616/2024 obliga a informar la condición frente al IVA del comprador en
 * el comprobante. Omitirla es un rechazo, así que se manda siempre.
 */
export const CONDICION_IVA_RECEPTOR = {
  RESPONSABLE_INSCRIPTO: 1,
  EXENTO: 4,
  CONSUMIDOR_FINAL: 5,
  MONOTRIBUTO: 6,
} as const;

/** Traduce la condición del cliente al código de ARCA. */
export function condicionIvaReceptorArca(condicion: string | null | undefined): number {
  switch (condicion) {
    case 'RESPONSABLE_INSCRIPTO':
      return CONDICION_IVA_RECEPTOR.RESPONSABLE_INSCRIPTO;
    case 'MONOTRIBUTO':
      return CONDICION_IVA_RECEPTOR.MONOTRIBUTO;
    case 'EXENTO':
      return CONDICION_IVA_RECEPTOR.EXENTO;
    default:
      // Sin cliente cargado, la venta es a consumidor final: el caso normal
      // del mostrador.
      return CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL;
  }
}

/** Códigos de documento de ARCA. */
const CUIT = 80;
const DNI = 96;
/** "Consumidor final", el que se usa cuando no se identifica al comprador. */
const SIN_IDENTIFICAR = 99;

export const RECEPTOR_CONSUMIDOR_FINAL: ReceptorArca = {
  tipoDocReceptor: SIN_IDENTIFICAR,
  nroDocReceptor: '0',
  condicionIvaReceptor: CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL,
};

/**
 * Traduce los datos del cliente a lo que espera ARCA.
 *
 * Casi todas las ventas del mostrador son a consumidor final sin identificar, y
 * ahí va DocTipo 99 con número 0. Pero una **Factura A no se puede emitir así**:
 * ARCA exige el CUIT del receptor, porque es el que va a computar el crédito
 * fiscal. Por eso el tipo de documento sale del dato real y no de un supuesto.
 */
export function receptorArca(
  documento: string | null | undefined,
  condicionIva?: string | null,
): ReceptorArca {
  const condicionIvaReceptor = condicionIvaReceptorArca(condicionIva);
  const sinIdentificar: ReceptorArca = {
    tipoDocReceptor: SIN_IDENTIFICAR,
    nroDocReceptor: '0',
    condicionIvaReceptor,
  };

  const digitos = (documento ?? '').replace(/\D/g, '');
  if (digitos === '') return sinIdentificar;

  if (digitos.length === 11) {
    // Un CUIT con dígito verificador malo no lo toma ARCA: mejor emitir como
    // consumidor final que recibir un rechazo por un dato cargado a los
    // apurones. Si el comprobante era A, la validación de la letra lo frena
    // igual y con un mensaje claro.
    return cuitEsValido(normalizarCuit(digitos))
      ? { tipoDocReceptor: CUIT, nroDocReceptor: digitos, condicionIvaReceptor }
      : sinIdentificar;
  }
  if (digitos.length === 7 || digitos.length === 8) {
    return { tipoDocReceptor: DNI, nroDocReceptor: digitos, condicionIvaReceptor };
  }
  return sinIdentificar;
}
