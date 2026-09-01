/**
 * WSFEv1: el servicio de facturación electrónica de ARCA.
 *
 * Dos operaciones alcanzan para emitir:
 *  - `FECompUltimoAutorizado`: cuál fue el último número autorizado para ese
 *    punto de venta y tipo de comprobante. ARCA es la fuente de verdad de la
 *    numeración, y exige que sea correlativa.
 *  - `FECAESolicitar`: manda el comprobante y devuelve el CAE.
 *
 * Soporta las tres condiciones fiscales:
 *
 *  - **C** (Monotributo): no discrimina IVA. El total va entero a `ImpNeto` y
 *    NO se manda el array de alícuotas. Mandarlo discriminado es rechazo.
 *  - **B** (Responsable Inscripto a consumidor final): discrimina IVA en el
 *    pedido aunque no se imprima discriminado.
 *  - **A** (entre responsables inscriptos): igual que B, pero exige CUIT del
 *    receptor. Sin eso se corta antes de llamar, porque ARCA lo rechazaría.
 *
 * ARCA valida que las cuentas cierren al centavo:
 * `ImpTotal = ImpNeto + ImpIVA + ImpTotConc + ImpOpEx + ImpTrib`, y que la
 * suma del array `Iva` dé `ImpIVA`. De eso se encarga `desglosarIvaIncluido`
 * en el dominio.
 */
import { esCorteDeTiempo } from './corte-de-tiempo';
import { detalleDeRed } from './detalle-de-red';
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

/** Un renglón del array `Iva` de WSFEv1. Importes como string, nunca float. */
export interface RenglonIva {
  readonly codigoArca: number;
  readonly base: string;
  readonly importe: string;
}

/**
 * Un comprobante al que este otro hace referencia (`CbtesAsoc`).
 *
 * Una Nota de Crédito no existe sola: corrige una factura concreta, y ARCA
 * exige decir cuál. Sin esto la NC vuelve rechazada.
 */
export interface ComprobanteAsociado {
  /** `CbteTipo` del comprobante que se corrige (Factura B = 6, etc.). */
  readonly codigoComprobante: number;
  readonly puntoDeVenta: number;
  readonly numero: number;
  /** CUIT del emisor. En una anulación propia es el del comercio. */
  readonly cuit?: string;
  readonly fecha?: Date;
}

export interface DatosComprobante {
  readonly puntoDeVenta: number;
  /** CbteTipo de ARCA: Factura A=1, B=6, C=11 (y sus notas). */
  readonly codigoComprobante: number;
  readonly numero: number;
  /** Total con dos decimales, como string (nunca un float). */
  readonly total: string;
  readonly fecha: Date;
  /** `ImpNeto`. En un comprobante C es igual al total. */
  readonly neto: string;
  /** `ImpIVA`. Cero en un comprobante C. */
  readonly iva: string;
  /** `ImpOpEx`: operaciones exentas. */
  readonly exento: string;
  /** Detalle por alícuota. Vacío en un comprobante C. */
  readonly renglonesIva: readonly RenglonIva[];
  /**
   * `CbtesAsoc`: qué comprobante corrige este. Obligatorio en Notas de Crédito
   * y de Débito.
   */
  readonly comprobantesAsociados?: readonly ComprobanteAsociado[];
  /** Tipo de documento del receptor (80=CUIT, 96=DNI, 99=consumidor final). */
  readonly tipoDocReceptor?: number;
  readonly nroDocReceptor?: string;
  /**
   * `CondicionIVAReceptorId`: la condición del comprador frente al IVA
   * (1=Responsable Inscripto, 4=Exento, 5=Consumidor Final, 6=Monotributo).
   * La RG 5616/2024 la volvió obligatoria en el comprobante.
   */
  readonly condicionIvaReceptor?: number;
}

export interface ResultadoAutorizacion {
  readonly cae: string;
  readonly caeFechaVto: Date;
  readonly numero: number;
  /** Avisos de ARCA que no impiden emitir, pero conviene registrar. */
  readonly observaciones: readonly string[];
  /**
   * `ImpTotal` tal como lo tiene ARCA. Sólo viene al **consultar** un
   * comprobante: es lo que permite comparar contra lo que guardamos nosotros y
   * detectar un comprobante autorizado por otro importe.
   */
  readonly importeTotal?: string;
}

/** `yyyymmdd`, el formato de fecha de WSFEv1. */
export function aFechaArca(f: Date): string {
  const dd = (n: number) => String(n).padStart(2, '0');
  return `${f.getFullYear()}${dd(f.getMonth() + 1)}${dd(f.getDate())}`;
}

/** Comprobantes tipo C (Monotributo): no discriminan IVA. */
const CODIGOS_C = new Set([11, 12, 13]);
/** Comprobantes tipo A: entre responsables inscriptos, exigen CUIT del receptor. */
const CODIGOS_A = new Set([1, 2, 3]);
/**
 * Notas de Débito (2, 7, 12) y de Crédito (3, 8, 13).
 *
 * Todas corrigen otro comprobante, y ARCA exige informar cuál en `CbtesAsoc`.
 */
const CODIGOS_NC_ND = new Set([2, 3, 7, 8, 12, 13]);

export function esComprobanteC(codigo: number): boolean {
  return CODIGOS_C.has(codigo);
}

export function esComprobanteA(codigo: number): boolean {
  return CODIGOS_A.has(codigo);
}

/** ¿ARCA exige `CbtesAsoc` para este tipo de comprobante? */
export function requiereComprobanteAsociado(codigo: number): boolean {
  return CODIGOS_NC_ND.has(codigo);
}

/**
 * Cuánto se espera a ARCA antes de dar la llamada por perdida.
 *
 * Sin esto la venta se queda colgada: el cajero no ve ni un CAE ni un error, y
 * el sistema que se diseñó para seguir vendiendo con ARCA caída termina
 * frenado por ARCA lenta, que es peor que ARCA caída.
 */
export const TIMEOUT_WSFE_MS = 20_000;

export class ClienteWsfev1 {
  constructor(
    private readonly opciones: {
      readonly entorno: keyof typeof URL_WSFEV1;
      readonly cuit: string;
      readonly url?: string;
      readonly fetchImpl?: typeof fetch;
      readonly timeoutMs?: number;
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
    const discrimina = !esComprobanteC(datos.codigoComprobante);
    const tipoDoc = datos.tipoDocReceptor ?? 99;
    const nroDoc = datos.nroDocReceptor ?? '0';

    // Una Factura A es contra otro responsable inscripto: sin CUIT del
    // receptor, ARCA la rechaza. Mejor cortar acá que mandar un 99/0 que
    // seguro vuelve rechazado.
    if (esComprobanteA(datos.codigoComprobante) && (tipoDoc !== 80 || nroDoc === '0')) {
      throw new ErrorWsfeNoSoportado(
        'Una Factura A necesita el CUIT del cliente. Cargalo en la venta o emitila como Factura B.',
      );
    }

    // Una Nota de Crédito o de Débito corrige un comprobante concreto y ARCA
    // exige decir cuál. Sin esto vuelve rechazada, así que se corta antes.
    const asociados = datos.comprobantesAsociados ?? [];
    if (requiereComprobanteAsociado(datos.codigoComprobante) && asociados.length === 0) {
      throw new ErrorWsfeNoSoportado(
        'Una Nota de Crédito o de Débito tiene que informar el comprobante que corrige, y no se encontró el original.',
      );
    }

    // En un comprobante C no se discrimina IVA: el total va entero al neto y
    // NO va el array de alícuotas. Mandarlo discriminado es rechazo.
    const iva = discrimina && datos.renglonesIva.length > 0
      ? '<Iva>' +
        datos.renglonesIva
          .map(
            (r) =>
              '<AlicIva>' +
              `<Id>${r.codigoArca}</Id>` +
              `<BaseImp>${r.base}</BaseImp>` +
              `<Importe>${r.importe}</Importe>` +
              '</AlicIva>',
          )
          .join('') +
        '</Iva>'
      : '';

    const cbtesAsoc =
      asociados.length > 0
        ? '<CbtesAsoc>' +
          asociados
            .map(
              (a) =>
                '<CbteAsoc>' +
                `<Tipo>${a.codigoComprobante}</Tipo>` +
                `<PtoVta>${a.puntoDeVenta}</PtoVta>` +
                `<Nro>${a.numero}</Nro>` +
                (a.cuit !== undefined ? `<Cuit>${a.cuit}</Cuit>` : '') +
                (a.fecha !== undefined ? `<CbteFch>${aFechaArca(a.fecha)}</CbteFch>` : '') +
                '</CbteAsoc>',
            )
            .join('') +
          '</CbtesAsoc>'
        : '';

    const detalle =
      '<FECAEDetRequest>' +
      '<Concepto>1</Concepto>' +
      `<DocTipo>${tipoDoc}</DocTipo>` +
      `<DocNro>${nroDoc}</DocNro>` +
      `<CbteDesde>${datos.numero}</CbteDesde>` +
      `<CbteHasta>${datos.numero}</CbteHasta>` +
      `<CbteFch>${aFechaArca(datos.fecha)}</CbteFch>` +
      `<ImpTotal>${datos.total}</ImpTotal>` +
      '<ImpTotConc>0</ImpTotConc>' +
      `<ImpNeto>${discrimina ? datos.neto : datos.total}</ImpNeto>` +
      `<ImpOpEx>${discrimina ? datos.exento : '0'}</ImpOpEx>` +
      '<ImpTrib>0</ImpTrib>' +
      `<ImpIVA>${discrimina ? datos.iva : '0'}</ImpIVA>` +
      '<MonId>PES</MonId>' +
      '<MonCotiz>1</MonCotiz>' +
      // El orden importa: el XSD de WSFEv1 es una secuencia, y va
      // CondicionIVAReceptorId → CbtesAsoc → Iva, después de MonCotiz.
      `<CondicionIVAReceptorId>${datos.condicionIvaReceptor ?? 5}</CondicionIVAReceptorId>` +
      cbtesAsoc +
      iva +
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

  /**
   * Consulta un comprobante ya emitido. Devuelve `null` si ARCA no lo tiene.
   *
   * Sirve para el caso que no se puede resolver reintentando a ciegas: se pidió
   * el CAE, ARCA lo otorgó, y la respuesta se perdió en el camino (timeout,
   * corte de red). Del lado nuestro la venta quedó PENDIENTE; del lado de ARCA
   * el comprobante existe. Reintentar sin preguntar emitiría OTRO comprobante
   * con otro número y dejaría el primero vivo en ARCA sin registro acá.
   */
  async consultarComprobante(
    ticket: TicketAcceso,
    puntoDeVenta: number,
    codigoComprobante: number,
    numero: number,
  ): Promise<ResultadoAutorizacion | null> {
    const cuerpo =
      `<FECompConsultar xmlns="${NS}">` +
      this.auth(ticket) +
      '<FeCompConsReq>' +
      `<CbteTipo>${codigoComprobante}</CbteTipo>` +
      `<CbteNro>${numero}</CbteNro>` +
      `<PtoVta>${puntoDeVenta}</PtoVta>` +
      '</FeCompConsReq>' +
      '</FECompConsultar>';

    const xml = await this.llamar('FECompConsultar', cuerpo);
    return leerRespuestaConsulta(xml);
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
    const timeoutMs = this.opciones.timeoutMs ?? TIMEOUT_WSFE_MS;
    let res: Response;
    try {
      res = await hacerFetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: `${NS}${operacion}`,
        },
        body: sobre,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      if (esCorteDeTiempo(e)) {
        throw new ErrorWsfe(
          `ARCA no respondió en ${Math.round(timeoutMs / 1000)} segundos.`,
          true,
        );
      }
      throw new ErrorWsfe(
        `No se pudo contactar a ARCA: ${detalleDeRed(e)}`,
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

/** `yyyymmdd` de ARCA a `Date` local. */
function desdeFechaArca(yyyymmdd: string): Date {
  return new Date(
    Number(yyyymmdd.slice(0, 4)),
    Number(yyyymmdd.slice(4, 6)) - 1,
    Number(yyyymmdd.slice(6, 8)),
  );
}

/** Código de ARCA para "no existen datos para lo consultado". */
const SIN_DATOS_EN_ARCA = '602';

/**
 * Interpreta la respuesta de FECompConsultar.
 *
 * `null` significa que ARCA **no tiene** ese comprobante, y es una respuesta
 * legítima, no un error: es exactamente lo que se quería averiguar.
 *
 * Ojo con los nombres de los campos: en la consulta el CAE viene como
 * `CodAutorizacion` y su vencimiento como `FchVto`, no como en FECAESolicitar.
 * Se aceptan los dos por las dudas.
 */
export function leerRespuestaConsulta(xml: string): ResultadoAutorizacion | null {
  const errores = leerErrores(xml);
  if (errores.some((e) => e.codigo === SIN_DATOS_EN_ARCA)) return null;
  if (errores.length > 0) {
    throw new ErrorWsfe(
      `ARCA: ${errores.map((e) => e.mensaje).join('. ')}`,
      false,
      errores[0]?.codigo,
    );
  }

  const cae =
    /<CodAutorizacion>(\d+)<\/CodAutorizacion>/.exec(xml)?.[1] ??
    /<CAE>(\d+)<\/CAE>/.exec(xml)?.[1];
  const vto =
    /<FchVto>(\d{8})<\/FchVto>/.exec(xml)?.[1] ??
    /<CAEFchVto>(\d{8})<\/CAEFchVto>/.exec(xml)?.[1];
  // Sin CAE, el comprobante no está autorizado: para el que pregunta es lo
  // mismo que si no existiera.
  if (cae === undefined || vto === undefined) return null;

  const numero = /<CbteDesde>(\d+)<\/CbteDesde>/.exec(xml)?.[1];
  const importe = /<ImpTotal>([\d.]+)<\/ImpTotal>/.exec(xml)?.[1];
  return {
    cae,
    caeFechaVto: desdeFechaArca(vto),
    numero: numero === undefined ? 0 : Number(numero),
    observaciones: leerObservaciones(xml),
    ...(importe === undefined ? {} : { importeTotal: importe }),
  };
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
    caeFechaVto: desdeFechaArca(vto),
    numero: numero === undefined ? 0 : Number(numero),
    observaciones,
  };
}
