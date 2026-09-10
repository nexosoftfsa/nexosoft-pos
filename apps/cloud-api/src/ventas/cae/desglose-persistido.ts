/**
 * El desglose de IVA que se guarda con el comprobante.
 *
 * Se congela **lo que se le declaró a ARCA**, no se recalcula al reimprimir: si
 * el producto cambia de alícuota después de la venta, recalcular daría un
 * desglose distinto del que se emitió, y el duplicado de una Factura A tiene
 * que coincidir con el original.
 *
 * Hacía falta porque al reimprimir una Factura A el comprobante salía sin
 * discriminar IVA — sólo el total. Para la C no importaba (no discrimina); para
 * la A el duplicado así no sirve.
 */
import { Decimal } from '@prisma/client/runtime/library';
import type { Prisma } from '@prisma/client';
import type { DesgloseIva } from '@nexosoft/domain';

/** Un renglón del array `Iva` de WSFEv1, como se guarda en la base. */
export interface RenglonIvaGuardado {
  readonly codigoArca: number;
  /** `BaseImp` como string decimal, para no perder precisión en JSON. */
  readonly base: string;
  /** `Importe` como string decimal. */
  readonly importe: string;
}

/**
 * Las columnas del desglose, listas para el `create` de Prisma.
 *
 * `ivaPorAlicuota` va tipado como `InputJsonValue` y no como
 * `RenglonIvaGuardado[]`: es una columna Json y Prisma no acepta el tipo
 * concreto. La forma real de lo que se guarda la fija `aDesglosePersistido`, y
 * al leer se valida en `leerDesglosePersistido` — que es donde corresponde,
 * porque lo que vuelve de la base es `unknown` por más que acá se tipe lindo.
 */
export interface DesglosePersistido {
  readonly impNeto: Decimal;
  readonly impIva: Decimal;
  readonly impOpEx: Decimal;
  readonly ivaPorAlicuota: Prisma.InputJsonValue;
}

export function aDesglosePersistido(d: DesgloseIva): DesglosePersistido {
  return {
    impNeto: new Decimal(d.neto.aDecimalString(2)),
    impIva: new Decimal(d.iva.aDecimalString(2)),
    impOpEx: new Decimal(d.exento.aDecimalString(2)),
    ivaPorAlicuota: d.porAlicuota.map((r) => ({
      codigoArca: r.codigoArca,
      base: r.base.aDecimalString(2),
      importe: r.importe.aDecimalString(2),
    })),
  };
}

/**
 * Lee lo guardado, tolerando lo que quedó de antes.
 *
 * Una venta anterior a este campo tiene todo en `null` y se sigue reimprimiendo
 * sin discriminar, como hasta ahora. No se intenta reconstruir: sería inventar
 * un desglose que quizá no es el que se declaró.
 */
export function leerDesglosePersistido(venta: {
  // `undefined` además de `null` a propósito: la venta puede venir de un
  // `select` que no pidió estas columnas. Tratar eso como "hay desglose" hacía
  // reventar la lectura con "Cannot read properties of undefined".
  impNeto?: Decimal | null;
  impIva?: Decimal | null;
  impOpEx?: Decimal | null;
  ivaPorAlicuota?: unknown;
}): { neto: string; iva: string; exento: string; porAlicuota: RenglonIvaGuardado[] } | null {
  const { impNeto, impIva, impOpEx } = venta;
  if (impNeto == null || impIva == null || impOpEx == null) return null;
  return {
    neto: impNeto.toFixed(2),
    iva: impIva.toFixed(2),
    exento: impOpEx.toFixed(2),
    porAlicuota: renglones(venta.ivaPorAlicuota),
  };
}

/** Los importes tal como viajan en la solicitud a ARCA. */
export interface ImportesParaArca {
  readonly neto: string;
  readonly iva: string;
  readonly exento: string;
  readonly renglonesIva: readonly RenglonIvaGuardado[];
}

/** Un desglose recién calculado, listo para mandar. */
export function aImportesParaArca(d: DesgloseIva): ImportesParaArca {
  return {
    neto: d.neto.aDecimalString(2),
    iva: d.iva.aDecimalString(2),
    exento: d.exento.aDecimalString(2),
    renglonesIva: d.porAlicuota.map((r) => ({
      codigoArca: r.codigoArca,
      base: r.base.aDecimalString(2),
      importe: r.importe.aDecimalString(2),
    })),
  };
}

/**
 * Lo guardado al emitir, listo para mandar. `null` si no hay nada guardado.
 *
 * Es lo que hay que preferir al reintentar: recalcular puede dar otra cosa —o
 * nada— y lo que ARCA tiene que recibir es lo que ya se declaró y se imprimió.
 */
export function importesGuardados(venta: {
  impNeto?: Decimal | null;
  impIva?: Decimal | null;
  impOpEx?: Decimal | null;
  ivaPorAlicuota?: unknown;
}): ImportesParaArca | null {
  const leido = leerDesglosePersistido(venta);
  if (leido === null) return null;
  return {
    neto: leido.neto,
    iva: leido.iva,
    exento: leido.exento,
    renglonesIva: leido.porAlicuota,
  };
}

/** El JSON viene de la base y es `unknown`: se valida antes de creerle. */
function renglones(crudo: unknown): RenglonIvaGuardado[] {
  if (!Array.isArray(crudo)) return [];
  return crudo.flatMap((r) => {
    if (r === null || typeof r !== 'object') return [];
    const { codigoArca, base, importe } = r as Record<string, unknown>;
    if (typeof codigoArca !== 'number' || typeof base !== 'string' || typeof importe !== 'string') {
      return [];
    }
    return [{ codigoArca, base, importe }];
  });
}
