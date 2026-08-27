/**
 * QR fiscal de ARCA (RG 4892/2020).
 *
 * Desde 2021 todo comprobante electrónico tiene que llevar impreso un QR con
 * los datos de la operación. No es decorativo: cualquiera lo escanea y ARCA le
 * dice si ese comprobante existe. Un ticket sin QR está mal emitido.
 *
 * El contenido es una URL fija con un parámetro `p` que lleva un JSON
 * codificado en base64. Los nombres de los campos y el orden los define ARCA;
 * no se pueden cambiar.
 *
 * Vive en el dominio porque lo necesitan el ticket chico, el A4 y la vista
 * previa: una sola definición, no tres.
 */
import { normalizarCuit } from './cuit.js';

export const URL_QR_ARCA = 'https://www.afip.gob.ar/fe/qr/';

export interface DatosQrArca {
  /** Fecha de emisión del comprobante. */
  readonly fecha: Date;
  /** CUIT del emisor (el comercio). */
  readonly cuit: string;
  readonly puntoDeVenta: number;
  /** Código de tipo de comprobante de ARCA (Factura C = 11, etc.). */
  readonly tipoComprobante: number;
  readonly numeroComprobante: number;
  /** Importe total, como string con decimales. */
  readonly importe: string;
  /** Tipo de documento del receptor. 99 = consumidor final. */
  readonly tipoDocReceptor?: number;
  /** Número de documento del receptor. 0 para consumidor final. */
  readonly nroDocReceptor?: number;
  /** El CAE que devolvió ARCA. */
  readonly cae: string;
}

/** `yyyy-mm-dd`, que es como lo pide el QR (distinto del yyyymmdd de WSFEv1). */
function aFechaQr(f: Date): string {
  const dd = (n: number) => String(n).padStart(2, '0');
  return `${f.getFullYear()}-${dd(f.getMonth() + 1)}-${dd(f.getDate())}`;
}

const ALFABETO_B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** UTF-8 de un string, sin depender de `TextEncoder` ni de `Buffer`. */
function aBytesUtf8(texto: string): number[] {
  const bytes: number[] = [];
  for (const caracter of texto) {
    const cp = caracter.codePointAt(0) as number;
    if (cp < 0x80) bytes.push(cp);
    else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000)
      bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
  }
  return bytes;
}

/**
 * Base64 propio, a mano.
 *
 * `btoa` es del navegador y `Buffer` es de Node; este paquete corre en los dos
 * (el POS lo compila Vite, el servidor lo carga como CommonJS). Escribirlo acá
 * evita tener que preguntar dónde estamos corriendo.
 */
function aBase64(texto: string): string {
  const bytes = aBytesUtf8(texto);
  let salida = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] as number;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    salida += ALFABETO_B64[b0 >> 2];
    salida += ALFABETO_B64[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    salida += b1 === undefined ? "=" : ALFABETO_B64[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    salida += b2 === undefined ? "=" : ALFABETO_B64[b2 & 0x3f];
  }
  return salida;
}

/**
 * El contenido exacto del QR: la URL que hay que codificar.
 *
 * Los nombres de las claves los fija ARCA (`ver`, `fecha`, `cuit`, `ptoVta`,
 * …). Cambiar alguno hace que el comprobante no se pueda verificar.
 */
export function urlQrArca(datos: DatosQrArca): string {
  const payload = {
    ver: 1,
    fecha: aFechaQr(datos.fecha),
    cuit: Number(normalizarCuit(datos.cuit)),
    ptoVta: datos.puntoDeVenta,
    tipoCmp: datos.tipoComprobante,
    nroCmp: datos.numeroComprobante,
    importe: Number(datos.importe),
    moneda: 'PES',
    ctz: 1,
    tipoDocRec: datos.tipoDocReceptor ?? 99,
    nroDocRec: datos.nroDocReceptor ?? 0,
    tipoCodAut: 'E',
    codAut: Number(datos.cae),
  };
  return `${URL_QR_ARCA}?p=${aBase64(JSON.stringify(payload))}`;
}

/**
 * `true` si el comprobante puede llevar QR.
 *
 * Sin CAE no hay nada que verificar: un ticket interno o uno que todavía
 * espera la autorización de ARCA no lleva QR. Imprimir uno vacío o inventado
 * sería peor que no imprimirlo.
 */
export function llevaQrFiscal(cae: string | null | undefined): boolean {
  return typeof cae === 'string' && cae.trim() !== '';
}
