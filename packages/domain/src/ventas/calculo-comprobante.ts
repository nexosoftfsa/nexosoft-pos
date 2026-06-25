/**
 * Cálculo de totales de un comprobante: subtotal, descuentos, IVA discriminado
 * por alícuota y total. Es la única fuente de verdad del cálculo (POS + backend).
 *
 * ## Tratamiento del IVA según la letra (ADR-0012 y ADR-0013)
 *  - **A**: IVA discriminado. Se muestran neto + IVA por alícuota.
 *  - **B**: IVA incluido en el precio; NO se discrimina en el comprobante, pero
 *    se calcula internamente (débito fiscal del RI, libro IVA / ARCA en Fase 2).
 *  - **C** (Monotributo): sin IVA. El precio es el total; no hay descomposición.
 *
 * ## Precios IVA incluido vs. netos
 * Por defecto los precios vienen **IVA incluido** (precio final de góndola, caso
 * minorista). Con `preciosIncluyenIva: false` se interpretan como netos (caso
 * típico de Factura A mayorista) y el IVA se suma por encima.
 *
 * ## Redondeo (conciliado, sin desfasajes de centavos)
 * Cada línea se redondea a 2 decimales; el IVA se descompone por **grupo de
 * alícuota** sobre importes ya redondeados, de modo que siempre se cumple
 * `netoGravado + iva = total`.
 *
 * ## Invariantes garantizadas (ver tests)
 *  - `netoGravado + iva = total`
 *  - `Σ subtotalesPorAlicuota.neto = netoGravado` y `Σ …iva = iva`
 *  - `brutoSinDescuento − descuento = Σ líneas.importe`
 *  - IVA incluido: `Σ líneas.importe = total`; netos: `Σ líneas.importe = netoGravado`
 *
 * Nota: los **impuestos internos** y el **recargo por forma de pago** se calculan
 * en fases siguientes (POS / ARCA), con su propio ADR; acá `impuestosInternos`
 * es siempre 0,00 para mantener estable la forma del resultado.
 */
import { ErrorDominio } from "../comun/errores.js";
import type { AlicuotaIva } from "../fiscal/alicuota-iva.js";
import {
  discriminaIva as tipoDiscriminaIva,
  letraDe,
  type TipoComprobante,
} from "../fiscal/tipo-comprobante.js";
import { Money } from "../dinero/money.js";

/** Una línea de venta tal como la ingresa el cajero/operador. */
export interface LineaVenta {
  readonly descripcion: string;
  /** Cantidad (puede ser fraccionada: 1,250 kg). */
  readonly cantidad: number | string;
  /** Precio unitario, IVA incluido o neto según `preciosIncluyenIva`. */
  readonly precioUnitario: Money;
  readonly alicuota: AlicuotaIva;
  /** Descuento de la línea, en porcentaje 0..100. */
  readonly descuentoPorcentaje?: number;
}

export interface OpcionesCalculo {
  readonly tipo: TipoComprobante;
  /** Si los precios incluyen IVA. Por defecto `true` (góndola minorista). */
  readonly preciosIncluyenIva?: boolean;
  /** Descuento global sobre todo el comprobante, en porcentaje 0..100. */
  readonly descuentoPorcentaje?: number;
}

export interface LineaCalculada {
  readonly descripcion: string;
  readonly cantidad: string;
  readonly precioUnitario: Money;
  readonly alicuota: AlicuotaIva;
  readonly descuentoPorcentaje: number;
  /** Importe final de la línea (con descuentos de línea y global aplicados). */
  readonly importe: Money;
}

export interface SubtotalPorAlicuota {
  readonly alicuota: AlicuotaIva;
  readonly neto: Money;
  readonly iva: Money;
}

export interface ResultadoComprobante {
  readonly tipo: TipoComprobante;
  readonly discriminaIva: boolean;
  readonly preciosIncluyenIva: boolean;
  readonly lineas: readonly LineaCalculada[];
  readonly subtotalesPorAlicuota: readonly SubtotalPorAlicuota[];
  /** Suma de precios de lista (cantidad × precio), antes de descuentos. */
  readonly brutoSinDescuento: Money;
  /** Total descontado (descuentos de línea + global). */
  readonly descuento: Money;
  readonly netoGravado: Money;
  readonly iva: Money;
  /** Reservado: siempre 0,00 en Fase 1.1 (ver nota del módulo). */
  readonly impuestosInternos: Money;
  readonly total: Money;
}

function validarPorcentaje(valor: number, contexto: string): void {
  if (!Number.isFinite(valor) || valor < 0 || valor > 100) {
    throw new ErrorDominio("PORCENTAJE_INVALIDO", `${contexto} debe estar entre 0 y 100: ${valor}`);
  }
}

/**
 * Calcula los totales de un comprobante a partir de sus líneas.
 *
 * @throws {ErrorDominio} si no hay líneas, o si una cantidad/porcentaje es inválido.
 */
export function calcularComprobante(
  lineas: readonly LineaVenta[],
  opciones: OpcionesCalculo,
): ResultadoComprobante {
  if (lineas.length === 0) {
    throw new ErrorDominio(
      "COMPROBANTE_SIN_LINEAS",
      "El comprobante debe tener al menos una línea.",
    );
  }

  const preciosIncluyenIva = opciones.preciosIncluyenIva ?? true;
  const descuentoGlobal = opciones.descuentoPorcentaje ?? 0;
  validarPorcentaje(descuentoGlobal, "El descuento global");

  const letra = letraDe(opciones.tipo);
  const tieneIva = letra === "A" || letra === "B";

  const lineasCalc: LineaCalculada[] = [];
  let brutoSinDescAcum = Money.cero();

  // Grupos por alícuota, acumulando importes de línea YA redondeados.
  const grupos = new Map<number, { readonly alicuota: AlicuotaIva; bruto: Money }>();

  for (const linea of lineas) {
    const cantidad = Money.desde(linea.cantidad); // factor numérico exacto
    if (!cantidad.esPositivo()) {
      throw new ErrorDominio(
        "CANTIDAD_INVALIDA",
        `La cantidad debe ser mayor a cero (línea "${linea.descripcion}").`,
      );
    }
    if (linea.precioUnitario.esNegativo()) {
      throw new ErrorDominio(
        "PRECIO_INVALIDO",
        `El precio no puede ser negativo (línea "${linea.descripcion}").`,
      );
    }
    const descLinea = linea.descuentoPorcentaje ?? 0;
    validarPorcentaje(descLinea, `El descuento de "${linea.descripcion}"`);

    const brutoLista = linea.precioUnitario.multiplicarPor(linea.cantidad);
    const trasDescLinea = brutoLista.restar(brutoLista.porcentaje(descLinea));
    const brutoFinal = trasDescLinea.restar(trasDescLinea.porcentaje(descuentoGlobal));
    const importe = brutoFinal.redondear(2);

    lineasCalc.push({
      descripcion: linea.descripcion,
      cantidad: cantidad.aDecimalString(3),
      precioUnitario: linea.precioUnitario,
      alicuota: linea.alicuota,
      descuentoPorcentaje: descLinea,
      importe,
    });

    brutoSinDescAcum = brutoSinDescAcum.sumar(brutoLista);

    const grupo = grupos.get(linea.alicuota.porcentaje);
    if (grupo === undefined) {
      grupos.set(linea.alicuota.porcentaje, {
        alicuota: linea.alicuota,
        bruto: importe,
      });
    } else {
      grupo.bruto = grupo.bruto.sumar(importe);
    }
  }

  // Descomposición de IVA por grupo de alícuota.
  const subtotalesPorAlicuota: SubtotalPorAlicuota[] = [];
  let netoGravado = Money.cero();
  let iva = Money.cero();

  for (const { alicuota, bruto } of grupos.values()) {
    let neto: Money;
    let ivaGrupo: Money;

    if (!tieneIva || alicuota.porcentaje === 0) {
      neto = bruto;
      ivaGrupo = Money.cero();
    } else if (preciosIncluyenIva) {
      // Descompone el bruto: neto = bruto × 100 / (100 + alícuota).
      neto = bruto
        .multiplicarPor(100)
        .dividirPor(100 + alicuota.porcentaje)
        .redondear(2);
      ivaGrupo = bruto.restar(neto); // garantiza neto + iva = bruto
    } else {
      neto = bruto;
      ivaGrupo = neto.porcentaje(alicuota.porcentaje).redondear(2);
    }

    subtotalesPorAlicuota.push({ alicuota, neto, iva: ivaGrupo });
    netoGravado = netoGravado.sumar(neto);
    iva = iva.sumar(ivaGrupo);
  }

  const sumaImportes = lineasCalc.reduce((acc, l) => acc.sumar(l.importe), Money.cero());
  const brutoSinDescuento = brutoSinDescAcum.redondear(2);
  const descuento = brutoSinDescuento.restar(sumaImportes);
  // IVA incluido: total = Σ importes. Netos: el IVA se suma por encima.
  const total = preciosIncluyenIva ? sumaImportes : netoGravado.sumar(iva);

  return {
    tipo: opciones.tipo,
    discriminaIva: tipoDiscriminaIva(opciones.tipo),
    preciosIncluyenIva,
    lineas: lineasCalc,
    subtotalesPorAlicuota,
    brutoSinDescuento,
    descuento,
    netoGravado,
    iva,
    impuestosInternos: Money.cero(),
    total,
  };
}
