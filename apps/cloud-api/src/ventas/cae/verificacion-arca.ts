import type { EntornoArca } from '../../fiscal/arca/wsaa';
import type { ResultadoAutorizacion } from '../../fiscal/arca/wsfev1';

/**
 * Qué contestó ARCA sobre un comprobante nuestro.
 *
 *  - `AUTORIZADO`: ARCA lo tiene y coincide con lo que guardamos.
 *  - `DIFIERE`: ARCA lo tiene, pero algún dato no coincide. Es el caso grave y
 *    el que justifica comparar en vez de sólo preguntar "¿está?".
 *  - `NO_ESTA`: ARCA no tiene ese comprobante.
 *  - `NO_APLICA`: no es un comprobante fiscal (ticket interno).
 *  - `NO_SE_PUDO`: no se pudo consultar. **No dice nada del comprobante.**
 */
export type EstadoVerificacion =
  | 'AUTORIZADO'
  | 'DIFIERE'
  | 'NO_ESTA'
  | 'NO_APLICA'
  | 'NO_SE_PUDO';

export interface VerificacionArca {
  readonly estado: EstadoVerificacion;
  readonly mensaje: string;
  /** Qué no coincide, campo por campo. Vacío salvo en `DIFIERE`. */
  readonly diferencias: readonly string[];
  /** Lo que ARCA tiene registrado, cuando lo tiene. */
  readonly enArca?: {
    readonly cae: string;
    readonly caeFechaVto: string;
    readonly importeTotal?: string;
  };
}

/** Los importes de ARCA vienen como "1100.00" o "1100"; se comparan como número. */
function mismoImporte(a: string, b: string): boolean {
  const n = (s: string) => Number(s.replace(',', '.'));
  return Number.isFinite(n(a)) && Number.isFinite(n(b)) && n(a) === n(b);
}

/**
 * Compara lo que ARCA tiene contra lo que guardamos y lo traduce a algo que el
 * comercio pueda leer.
 *
 * El caso que más importa no es "no está": es que **esté con otros datos**. Un
 * comprobante autorizado por un importe distinto del que dice el ticket que se
 * le dio al cliente es un problema fiscal, y sin comparar nunca se vería.
 */
export function compararConArca(args: {
  readonly enArca: ResultadoAutorizacion | null;
  readonly local: { readonly cae: string | null; readonly total: string };
  readonly entorno: EntornoArca;
  readonly puntoDeVenta: number;
  readonly numero: number;
}): VerificacionArca {
  const { enArca, local, entorno, puntoDeVenta, numero } = args;
  const dondeSeConsulto = entorno === 'homologacion' ? 'homologación (pruebas)' : 'producción';
  const comprobante = `${String(puntoDeVenta).padStart(4, '0')}-${String(numero).padStart(8, '0')}`;

  if (enArca === null) {
    return {
      estado: 'NO_ESTA',
      mensaje:
        `ARCA no tiene registrado el comprobante ${comprobante} en ${dondeSeConsulto}.` +
        (local.cae === null
          ? ' Acá tampoco figura autorizado, así que es coherente: todavía no se emitió.'
          : ' Pero acá figura con CAE, así que hay que revisarlo.'),
      diferencias: [],
    };
  }

  const diferencias: string[] = [];
  if (local.cae !== null && local.cae !== enArca.cae) {
    diferencias.push(`el CAE que guardamos es ${local.cae} y ARCA tiene ${enArca.cae}`);
  }
  if (enArca.importeTotal !== undefined && !mismoImporte(enArca.importeTotal, local.total)) {
    diferencias.push(`el total acá es ${local.total} y en ARCA es ${enArca.importeTotal}`);
  }

  const detalle = {
    cae: enArca.cae,
    caeFechaVto: enArca.caeFechaVto.toISOString(),
    ...(enArca.importeTotal === undefined ? {} : { importeTotal: enArca.importeTotal }),
  };

  if (diferencias.length > 0) {
    return {
      estado: 'DIFIERE',
      mensaje: `ARCA tiene el comprobante ${comprobante} en ${dondeSeConsulto}, pero con datos distintos a los nuestros.`,
      diferencias,
      enArca: detalle,
    };
  }

  return {
    estado: 'AUTORIZADO',
    mensaje:
      `ARCA confirma el comprobante ${comprobante} en ${dondeSeConsulto}, con CAE ${enArca.cae}.` +
      (entorno === 'homologacion'
        ? ' Es un comprobante de prueba: no tiene validez fiscal y no aparece en las páginas públicas de ARCA.'
        : ''),
    diferencias: [],
    enArca: detalle,
  };
}
