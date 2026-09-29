import {
  ALICUOTAS_IVA,
  alicuotaPorPorcentaje,
  Money,
  type AlicuotaIva,
  type DesgloseIva,
} from '@nexosoft/domain';

/** Lo que manda el POS por una línea exenta. Un "0" sería otra cosa. */
export const ALICUOTA_EXENTA = 'EXENTO';

/**
 * La alícuota que el POS **imprimió** en esa línea, como viene en el payload:
 * `"EXENTO"` o el porcentaje en texto (`"21"`, `"10.5"`).
 *
 * `undefined` si no se entiende o si no vino — ahí manda el producto del
 * servidor, como antes.
 */
export function alicuotaImpresa(valor: string | undefined): AlicuotaIva | null | undefined {
  if (valor === undefined) return undefined;
  const v = valor.trim();
  if (v.toUpperCase() === ALICUOTA_EXENTA) return null;
  return alicuotaPorPorcentaje(Number(v));
}

/** Para comparar lo impreso con lo que dice el catálogo del servidor. */
export function etiquetaAlicuota(a: AlicuotaIva | null): string {
  return a === null ? ALICUOTA_EXENTA : String(a.porcentaje);
}

/**
 * Traduce el `tipoIva` que guarda el producto a la alícuota del dominio, que
 * es la que lleva el código de ARCA.
 *
 * `EXENTO` devuelve `null`: no es una alícuota del cero por ciento. ARCA los
 * trata distinto — el exento va en `ImpOpEx` y no lleva renglón en el detalle,
 * mientras que el 0% sí lleva renglón con Id 3.
 */
export function alicuotaDeTipoIva(tipoIva: string | undefined): AlicuotaIva | null {
  switch (tipoIva) {
    case 'IVA_10_5':
      return ALICUOTAS_IVA.DIEZ_CON_CINCO;
    case 'IVA_27':
      return ALICUOTAS_IVA.VEINTISIETE;
    case 'EXENTO':
      return null;
    case 'IVA_21':
    default:
      // Sin dato, la alícuota general: es la del 99% del comercio minorista y
      // es la que menos sorprende si un producto quedó sin configurar.
      return ALICUOTAS_IVA.VEINTIUNO;
  }
}

/**
 * Corrige los centavos que puede dejar el prorrateo del descuento global.
 *
 * ARCA valida que `ImpTotal = ImpNeto + ImpIVA + ImpOpEx` al centavo. Repartir
 * un descuento entre varias líneas puede dejar una diferencia de uno o dos
 * centavos; se absorbe en la base de la alícuota más grande, que es donde
 * menos se nota y donde el error relativo es mínimo.
 */
export function ajustarAlTotal(desglose: DesgloseIva, total: Money): DesgloseIva {
  const diferencia = total.restar(desglose.total);
  if (diferencia.esCero()) return desglose;

  if (desglose.porAlicuota.length === 0) {
    // Sin detalle (comprobante C): el total va entero al neto.
    return { ...desglose, neto: total, total };
  }

  const mayor = [...desglose.porAlicuota].sort((a, b) =>
    b.base.mayorQue(a.base) ? 1 : b.base.menorQue(a.base) ? -1 : 0,
  )[0] as DesgloseIva['porAlicuota'][number];

  const porAlicuota = desglose.porAlicuota.map((r) =>
    r.codigoArca === mayor.codigoArca ? { ...r, base: r.base.sumar(diferencia) } : r,
  );
  return {
    ...desglose,
    porAlicuota,
    neto: desglose.neto.sumar(diferencia),
    total,
  };
}
