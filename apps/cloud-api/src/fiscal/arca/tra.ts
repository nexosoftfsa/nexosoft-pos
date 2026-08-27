/**
 * TRA: Ticket de Requerimiento de Acceso.
 *
 * Es el XML que se le manda a WSAA (el servicio de autenticación de ARCA)
 * firmado con el certificado del comercio. ARCA lo valida y devuelve un
 * "ticket de acceso" con un token y una firma, que después viajan en cada
 * llamada al servicio de facturación.
 *
 * Reglas que ARCA impone y que no perdonan:
 *
 *  - `uniqueId` tiene que ser distinto en cada pedido. ARCA guarda los
 *    anteriores y rechaza uno repetido.
 *  - `generationTime` y `expirationTime` van en hora LOCAL con offset (ISO
 *    8601). Mandarlos en UTC "Z" es rechazo directo.
 *  - La ventana no puede ser larga: ARCA rechaza si `expirationTime` está
 *    demasiado lejos. Se usan 10 minutos, que es lo habitual.
 *  - `generationTime` un poco en el pasado, para tolerar que el reloj de la PC
 *    del comercio esté unos minutos adelantado. Un reloj adelantado es de las
 *    causas más comunes de "el TRA todavía no es válido".
 */

/** Minutos hacia atrás en generationTime, por si el reloj está adelantado. */
const MARGEN_ATRAS_MIN = 10;
/** Minutos de vigencia del pedido. */
const VIGENCIA_MIN = 10;

/** Fecha a ISO 8601 con offset local (`2026-08-27T14:05:00-03:00`). */
export function aIsoConOffset(fecha: Date): string {
  const dosDigitos = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const offsetMin = -fecha.getTimezoneOffset();
  const signo = offsetMin >= 0 ? '+' : '-';
  const off = `${signo}${dosDigitos(offsetMin / 60)}:${dosDigitos(offsetMin % 60)}`;
  return (
    `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}` +
    `T${dosDigitos(fecha.getHours())}:${dosDigitos(fecha.getMinutes())}:${dosDigitos(fecha.getSeconds())}${off}`
  );
}

export interface OpcionesTra {
  /** Servicio al que se pide acceso. Para facturación electrónica: `wsfe`. */
  readonly servicio: string;
  /** Sólo para tests: normalmente es "ahora". */
  readonly ahora?: Date;
  /** Sólo para tests: normalmente se deriva del reloj. */
  readonly uniqueId?: number;
}

/** Arma el XML del TRA, listo para firmar. */
export function construirTra(opciones: OpcionesTra): string {
  const ahora = opciones.ahora ?? new Date();
  const desde = new Date(ahora.getTime() - MARGEN_ATRAS_MIN * 60_000);
  const hasta = new Date(ahora.getTime() + VIGENCIA_MIN * 60_000);
  // El uniqueId de ARCA entra en un entero de 32 bits: el epoch en segundos
  // sirve y no se repite, pero hay que recortarlo para que no se desborde.
  const uniqueId = opciones.uniqueId ?? Math.floor(ahora.getTime() / 1000) % 2_147_483_647;

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<loginTicketRequest version="1.0">',
    '<header>',
    `<uniqueId>${uniqueId}</uniqueId>`,
    `<generationTime>${aIsoConOffset(desde)}</generationTime>`,
    `<expirationTime>${aIsoConOffset(hasta)}</expirationTime>`,
    '</header>',
    `<service>${opciones.servicio}</service>`,
    '</loginTicketRequest>',
  ].join('');
}

export interface TicketAcceso {
  readonly token: string;
  readonly sign: string;
  /** Cuándo deja de servir. ARCA los da por 12 horas. */
  readonly expiracion: Date;
}

/**
 * Lee el ticket de la respuesta de WSAA.
 *
 * La respuesta es un SOAP que trae, escapado adentro, otro XML con el token,
 * la firma y la expiración. Se parsea con expresiones regulares y no con un
 * parser de XML a propósito: el formato es fijo, chico y conocido, y meter una
 * dependencia de XML para esto sería peor.
 */
export function leerTicketAcceso(respuestaSoap: string): TicketAcceso {
  const desescapar = (s: string) =>
    s
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');
  const xml = desescapar(respuestaSoap);

  const token = /<token>([\s\S]*?)<\/token>/.exec(xml)?.[1]?.trim();
  const sign = /<sign>([\s\S]*?)<\/sign>/.exec(xml)?.[1]?.trim();
  const expira = /<expirationTime>([\s\S]*?)<\/expirationTime>/.exec(xml)?.[1]?.trim();

  if (token === undefined || sign === undefined) {
    throw new Error(`WSAA no devolvió un ticket de acceso. Respuesta: ${recortar(respuestaSoap)}`);
  }
  const expiracion = expira === undefined ? null : new Date(expira);
  return {
    token,
    sign,
    // Si no vino o no se entiende, se asume corta: pedir uno nuevo de más es
    // barato; usar uno vencido es un rechazo.
    expiracion:
      expiracion !== null && !Number.isNaN(expiracion.getTime())
        ? expiracion
        : new Date(Date.now() + 60 * 60_000),
  };
}

/** Mensaje de error de un SOAP Fault de ARCA, si lo hay. */
export function leerFaultSoap(respuesta: string): string | null {
  const fault = /<faultstring>([\s\S]*?)<\/faultstring>/i.exec(respuesta)?.[1]?.trim();
  return fault === undefined || fault === '' ? null : fault;
}

function recortar(s: string, largo = 300): string {
  return s.length <= largo ? s : `${s.slice(0, largo)}…`;
}
