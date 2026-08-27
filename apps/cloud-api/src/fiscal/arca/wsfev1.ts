/**
 * WSFEv1: el servicio de facturación electrónica de ARCA.
 *
 * Dos operaciones alcanzan para emitir:
 *  - `FECompUltimoAutorizado`: cuál fue el último número autorizado para ese
 *    punto de venta y tipo de comprobante. ARCA es la fuente de verdad de la
 *    numeración, y exige que sea correlativa.
 *  - `FECAESolicitar`: manda el comprobante y devuelve el CAE.
 *
 * ALCANCE ACTUAL: **Factura C** (Monotributo), que no lleva desglose de IVA.
 * Para Responsable Inscripto (Factura A/B) hay que mandar neto, IVA y el
 * detalle por alícuota, y hoy la solicitud que llega desde ventas sólo trae el
 * total. Antes que mandarle a ARCA un desglose inventado —que sería declarar
 * mal— se corta con un mensaje claro. Ver `ErrorWsfeNoSoportado`.
 */
import { type TicketAcceso } from './tra';

export const URL_WSFEV1 = {
  homologacion: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
  produccion: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
} as const;

const NS = 'http://ar.gov.afip.dif.FEV1/';

export class ErrorWsfe extends Error {
  constructor(
    message: string,
    readonly transitorio: boolean,
    readonly codigo?: string,
  ) {
    super(message);
    this.name = 'ErrorWsfe';
  }
}

/** El comprobante no se puede armar con los datos que hay. No es transitorio. */
export class ErrorWsfeNoSoportado extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErrorWsfeNoSoportado';
  }
}

export interface DatosComprobante {
  readonly puntoDeVenta: number;
  /** CbteTipo de ARCA: Factura C = 11, Nota de Crédito C = 13. */
  readonly codigoComprobante: number;
  readonly numero: number;
  /** Total con dos decimales, como string (nunca un float). */
  readonly total: string;
  readonly fecha: Date;
}

export interface ResultadoAutorizacion {
  readonly cae: string;
  readonly caeFechaVto: Date;
  readonly numero: number;
  /** Avisos de ARCA que no impiden emitir, pero conviene registrar. */
  readonly observaciones: readonly string[];
}

/** `yyyymmdd`, el formato de fecha de WSFEv1. */
export function aFechaArca(f: Date): string {
  const dd = (n: number) => String(n).padStart(2, '0');
  return `${f.getFullYear()}${dd(f.getMonth() + 1)}${dd(f.getDate())}`;
}

/** Comprobantes tipo C: los únicos soportados por ahora. */
const CODIGOS_C = new Set([11, 12, 13]);

export function esComprobanteC(codigo: number): boolean {
  return CODIGOS_C.has(codigo);
}

export class ClienteWsfev1 {
  constructor(
    private readonly opciones: {
      readonly entorno: keyof typeof URL_WSFEV1;
      readonly cuit: string;
      readonly url?: string;
      readonly fetchImpl?: typeof fetch;
    },
  ) {}

  private get url(): string {
    return this.opciones.url ?? URL_WSFEV1[this.opciones.entorno];
  }

  /** Último número autorizado por ARCA para ese punto de venta y tipo. */
  async ultimoAutorizado(
    ticket: TicketAcceso,
    puntoDeVenta: number,
    codigoComprobante: number,
  ): Promise<number> {
    const cuerpo =
      `<FECompUltimoAutorizado xmlns="${NS}">` +
      this.auth(ticket) +
      `<PtoVta>${puntoDeVenta}</PtoVta>` +
      `<CbteTipo>${codigoComprobante}</CbteTipo>` +
      '</FECompUltimoAutorizado>';

    const xml = await this.llamar('FECompUltimoAutorizado', cuerpo);
    this.tirarSiHayErrores(xml);
    const nro = /<CbteNro>(\d+)<\/CbteNro>/.exec(xml)?.[1];
    if (nro === undefined) {
      throw new ErrorWsfe('ARCA no devolvió el último número autorizado.', true);
    }
    return Number(nro);
  }

  /** Pide el CAE. El número lo proponemos nosotros; ARCA valida que siga al último. */
  async solicitarCae(
    ticket: TicketAcceso,
    datos: DatosComprobante,
  ): Promise<ResultadoAutorizacion> {
    if (!esComprobanteC(datos.codigoComprobante)) {
      throw new ErrorWsfeNoSoportado(
        'Por ahora sólo se pueden autorizar comprobantes tipo C (Monotributo). ' +
          'Para Responsable Inscripto falta mandar el desglose de IVA, y prefiero no declarar algo inventado.',
      );
    }

    // En un comprobante C no hay IVA discriminado: el total es el neto y el
    // resto va en cero. Mandar un desglose acá seria declarar mal.
    const detalle =
      '<FECAEDetRequest>' +
      '<Concepto>1</Concepto>' +
      '<DocTipo>99</DocTipo>' +
      '<DocNro>0</DocNro>' +
      `<CbteDesde>${datos.numero}</CbteDesde>` +
      `<CbteHasta>${datos.numero}</CbteHasta>` +
      `<CbteFch>${aFechaArca(datos.fecha)}</CbteFch>` +
      `<ImpTotal>${datos.total}</ImpTotal>` +
      '<ImpTotConc>0</ImpTotConc>' +
      `<ImpNeto>${datos.total}</ImpNeto>` +
      '<ImpOpEx>0</ImpOpEx>' +
      '<ImpTrib>0</ImpTrib>' +
      '<ImpIVA>0</ImpIVA>' +
      '<MonId>PES</MonId>' +
      '<MonCotiz>1</MonCotiz>' +
      '</FECAEDetRequest>';

    const cuerpo =
      `<FECAESolicitar xmlns="${NS}">` +
      this.auth(ticket) +
      '<FeCAEReq>' +
      '<FeCabReq>' +
      '<CantReg>1</CantReg>' +
      `<PtoVta>${datos.puntoDeVenta}</PtoVta>` +
      `<CbteTipo>${datos.codigoComprobante}</CbteTipo>` +
      '</FeCabReq>' +
      `<FeDetReq>${detalle}</FeDetReq>` +
      '</FeCAEReq>' +
      '</FECAESolicitar>';

    const xml = await this.llamar('FECAESolicitar', cuerpo);
    return leerRespuestaCae(xml);
  }

  private auth(ticket: TicketAcceso): string {
    return (
      '<Auth>' +
      `<Token>${ticket.token}</Token>` +
      `<Sign>${ticket.sign}</Sign>` +
      `<Cuit>${this.opciones.cuit}</Cuit>` +
      '</Auth>'
    );
  }

  private async llamar(operacion: string, cuerpo: string): Promise<string> {
    const sobre =
      '<?xml version="1.0" encoding="utf-8"?>' +
      '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"' +
      ' xmlns:xsd="http://www.w3.org/2001/XMLSchema"' +
      ' xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
      `<soap:Body>${cuerpo}</soap:Body>` +
      '</soap:Envelope>';

    const hacerFetch = this.opciones.fetchImpl ?? fetch;
    let res: Response;
    try {
      res = await hacerFetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: `${NS}${operacion}`,
        },
        body: sobre,
      });
    } catch (e) {
      throw new ErrorWsfe(
        `No se pudo contactar a ARCA (${(e as Error).message}). Revisá la conexión.`,
        true,
      );
    }
    const texto = await res.text();
    const fault = /<faultstring>([\s\S]*?)<\/faultstring>/i.exec(texto)?.[1]?.trim();
    if (fault !== undefined) throw new ErrorWsfe(`ARCA respondió: ${fault}`, true);
    if (!res.ok) throw new ErrorWsfe(`ARCA respondió ${res.status}.`, true);
    return texto;
  }

  private tirarSiHayErrores(xml: string): void {
    const err = leerErrores(xml);
    if (err.length > 0) {
      throw new ErrorWsfe(`ARCA: ${err.map((e) => e.mensaje).join('. ')}`, false, err[0]?.codigo);
    }
  }
}

export interface ErrorDeArca {
  readonly codigo: string;
  readonly mensaje: string;
}

/** Errores que ARCA devuelve en el cuerpo (no como SOAP Fault). */
export function leerErrores(xml: string): ErrorDeArca[] {
  const bloque = /<Errors>([\s\S]*?)<\/Errors>/.exec(xml)?.[1];
  if (bloque === undefined) return [];
  const salida: ErrorDeArca[] = [];
  const re = /<Err>[\s\S]*?<Code>(\d+)<\/Code>[\s\S]*?<Msg>([\s\S]*?)<\/Msg>[\s\S]*?<\/Err>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bloque)) !== null) {
    salida.push({ codigo: m[1] ?? '', mensaje: (m[2] ?? '').trim() });
  }
  return salida;
}

/** Observaciones: no impiden emitir, pero hay que registrarlas. */
export function leerObservaciones(xml: string): string[] {
  const bloque = /<Observaciones>([\s\S]*?)<\/Observaciones>/.exec(xml)?.[1];
  if (bloque === undefined) return [];
  const salida: string[] = [];
  const re = /<Code>(\d+)<\/Code>[\s\S]*?<Msg>([\s\S]*?)<\/Msg>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bloque)) !== null) {
    salida.push(`${m[1]}: ${(m[2] ?? '').trim()}`);
  }
  return salida;
}

/** Interpreta la respuesta de FECAESolicitar. */
export function leerRespuestaCae(xml: string): ResultadoAutorizacion {
  const errores = leerErrores(xml);
  if (errores.length > 0) {
    throw new ErrorWsfe(
      `ARCA rechazó el comprobante: ${errores.map((e) => `${e.codigo} ${e.mensaje}`).join('. ')}`,
      false,
      errores[0]?.codigo,
    );
  }

  const resultado = /<Resultado>([APR])<\/Resultado>/.exec(xml)?.[1];
  const observaciones = leerObservaciones(xml);
  if (resultado === 'R') {
    throw new ErrorWsfe(
      `ARCA rechazó el comprobante. ${observaciones.join('. ')}`.trim(),
      false,
    );
  }

  const cae = /<CAE>(\d+)<\/CAE>/.exec(xml)?.[1];
  const vto = /<CAEFchVto>(\d{8})<\/CAEFchVto>/.exec(xml)?.[1];
  const numero = /<CbteDesde>(\d+)<\/CbteDesde>/.exec(xml)?.[1];
  if (cae === undefined || vto === undefined) {
    throw new ErrorWsfe(
      `ARCA no devolvió el CAE. ${observaciones.join('. ')}`.trim(),
      true,
    );
  }

  return {
    cae,
    caeFechaVto: new Date(
      Number(vto.slice(0, 4)),
      Number(vto.slice(4, 6)) - 1,
      Number(vto.slice(6, 8)),
    ),
    numero: numero === undefined ? 0 : Number(numero),
    observaciones,
  };
}
