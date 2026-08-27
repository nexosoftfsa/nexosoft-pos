/**
 * Desglose de IVA para pedirle el CAE a ARCA.
 *
 * En el comercio minorista los precios son finales (IVA incluido), pero ARCA
 * pide el neto y el IVA por separado, y además valida que las cuentas cierren
 * EXACTO:
 *
 *     ImpTotal = ImpNeto + ImpIVA + ImpTotConc + ImpOpEx + ImpTrib
 *     y la suma del detalle por alícuota tiene que dar ImpIVA
 *
 * Un peso de diferencia por redondeo es un rechazo. Por eso el cálculo agrupa
 * PRIMERO por alícuota y recién ahí separa: se redondea una vez por grupo, en
 * vez de una vez por línea, y el neto se obtiene restando (nunca dividiendo),
 * así la suma cierra por construcción.
 */
import { Money } from '../dinero/money.js';
import type { AlicuotaIva } from './alicuota-iva.js';

/** Una línea del comprobante, con su importe final (IVA incluido). */
export interface LineaParaDesglose {
  readonly importe: Money;
  /** `null` para líneas exentas o no gravadas. */
  readonly alicuota: AlicuotaIva | null;
}

/** Un renglón del array `Iva` de WSFEv1. */
export interface IvaPorAlicuota {
  /** `Id` de WSFEv1. */
  readonly codigoArca: number;
  /** `BaseImp`: el neto de esa alícuota. */
  readonly base: Money;
  /** `Importe`: el IVA de esa alícuota. */
  readonly importe: Money;
}

export interface DesgloseIva {
  /** `ImpNeto`: suma de las bases gravadas. */
  readonly neto: Money;
  /** `ImpIVA`: suma del IVA. */
  readonly iva: Money;
  /** `ImpOpEx`: importe de las operaciones exentas. */
  readonly exento: Money;
  /** `ImpTotal`. Siempre igual a neto + iva + exento. */
  readonly total: Money;
  readonly porAlicuota: readonly IvaPorAlicuota[];
}

/**
 * Separa neto e IVA a partir de importes que YA incluyen IVA.
 *
 * Para una alícuota del 21%: iva = importe × 21 / 121.
 */
export function desglosarIvaIncluido(lineas: readonly LineaParaDesglose[]): DesgloseIva {
  const gravadasPorCodigo = new Map<number, { alicuota: AlicuotaIva; importe: Money }>();
  let exento = Money.cero();

  for (const linea of lineas) {
    if (linea.alicuota === null) {
      exento = exento.sumar(linea.importe);
      continue;
    }
    const previo = gravadasPorCodigo.get(linea.alicuota.codigoArca);
    gravadasPorCodigo.set(linea.alicuota.codigoArca, {
      alicuota: linea.alicuota,
      importe: previo === undefined ? linea.importe : previo.importe.sumar(linea.importe),
    });
  }

  let neto = Money.cero();
  let iva = Money.cero();
  const porAlicuota: IvaPorAlicuota[] = [];

  // Orden estable por código: ARCA no lo exige, pero hace que dos pedidos con
  // los mismos datos produzcan el mismo XML, que vale oro para diagnosticar.
  const codigos = [...gravadasPorCodigo.keys()].sort((a, b) => a - b);
  for (const codigo of codigos) {
    const grupo = gravadasPorCodigo.get(codigo) as { alicuota: AlicuotaIva; importe: Money };
    const tasa = grupo.alicuota.porcentaje;
    // iva = importe × tasa / (100 + tasa), redondeado UNA vez por grupo.
    const ivaDelGrupo =
      tasa === 0
        ? Money.cero()
        : grupo.importe.multiplicarPor(tasa).dividirPor(100 + tasa).redondear(2);
    // El neto sale de restar, no de dividir: así base + iva da exactamente el
    // importe del grupo y la suma total cierra sin arrastrar centavos.
    const baseDelGrupo = grupo.importe.restar(ivaDelGrupo);

    porAlicuota.push({ codigoArca: codigo, base: baseDelGrupo, importe: ivaDelGrupo });
    neto = neto.sumar(baseDelGrupo);
    iva = iva.sumar(ivaDelGrupo);
  }

  return { neto, iva, exento, total: neto.sumar(iva).sumar(exento), porAlicuota };
}

/**
 * Desglose para un comprobante que NO discrimina IVA (tipo C, Monotributo).
 *
 * ARCA lo quiere con el total entero en `ImpNeto`, sin IVA y sin array de
 * alícuotas. No es que el IVA valga cero: es que en un comprobante C no se
 * discrimina, y mandarlo discriminado es un rechazo.
 */
export function desgloseSinDiscriminar(total: Money): DesgloseIva {
  return {
    neto: total,
    iva: Money.cero(),
    exento: Money.cero(),
    total,
    porAlicuota: [],
  };
}
