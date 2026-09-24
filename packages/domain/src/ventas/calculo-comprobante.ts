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
  /** `null` es exento: ver `Articulo.alicuotaIva`. */
  readonly alicuota: AlicuotaIva | null;
  /** Descuento de la línea, en porcentaje 0..100. */
  readonly descuentoPorcentaje?: number;
}

export interface OpcionesCalculo {
  readonly tipo: TipoComprobante;
  /** Si los precios incluyen IVA. Por defecto `true` (góndola minorista). */
  readonly preciosIncluyenIva?: boolean;
  /** Descuento global sobre todo el comprobante, en porcentaje 0..100. */
  readonly descuentoPorcentaje?: number;
  /** Recargo global (ej. financiación por tarjeta), en porcentaje 0..100. */
  readonly recargoPorcentaje?: number;
}

/**
 * Clave del grupo exento. Negativa a propósito: ningún porcentaje de IVA lo es,
 * así que no puede chocar con una alícuota real.
 */
const CLAVE_EXENTO = -1;

export interface LineaCalculada {
  readonly descripcion: string;
  readonly cantidad: string;
  readonly precioUnitario: Money;
  /** `null` es exento: ver `Articulo.alicuotaIva`. */
  readonly alicuota: AlicuotaIva | null;
  readonly descuentoPorcentaje: number;
  /** Importe final de la línea (con descuentos de línea y global aplicados). */
  readonly importe: Money;
  /**
   * El importe de la línea SIN IVA, y el precio unitario que le corresponde.
   *
   * Es lo que tiene que imprimir una Factura A: la norma pide precios unitarios
   * **netos de impuestos**, y el precio neto de la línea como cantidad ×
   * precio unitario neto. Hasta el 23/9/2026 la A salía con el precio final por
   * renglón y el IVA recién discriminado al pie, así que el contador que la
   * recibía no podía atar los renglones con los totales.
   *
   * **La suma de los `neto` de un grupo de alícuota da EXACTAMENTE el neto de
   * ese grupo.** No se calcula línea por línea dividiendo por (1 + tasa): eso
   * redondea una vez por renglón y la suma queda a uno o dos centavos del neto
   * declarado a ARCA. Se reparte el neto del grupo entre sus líneas y el resto
   * va a la última. Una Factura A cuyos renglones no suman su propio neto es
   * peor que una con renglones brutos: ahí el error se ve y parece nuestro.
   *
   * `netoUnitario` es informativo: con cantidades fraccionadas,
   * `netoUnitario × cantidad` puede diferir de `neto` en centavos. Manda el
   * `neto` de la línea, como en cualquier factura.
   */
  readonly neto: Money;
  readonly netoUnitario: Money;
}

export interface SubtotalPorAlicuota {
  /** `null` es exento: ver `Articulo.alicuotaIva`. */
  readonly alicuota: AlicuotaIva | null;
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
  /** Recargo global aplicado (0,00 si no hay). */
  readonly recargo: Money;
  readonly netoGravado: Money;
  readonly iva: Money;
  /** Reservado: siempre 0,00 en Fase 1.1 (ver nota del módulo). */
  readonly impuestosInternos: Money;
  readonly total: Money;
}

/**
 * Reparte el neto de cada grupo de alícuota entre sus líneas, en proporción al
 * importe de cada una, y le da el resto a la última.
 *
 * Es lo que hace que **la suma de los netos de las líneas dé exactamente el
 * neto del grupo**. Calcular cada línea por separado —dividiéndola por
 * (1 + tasa)— redondea una vez por renglón y deja la suma a uno o dos centavos
 * del neto que se le declaró a ARCA.
 *
 * Cuando el neto del grupo es igual a su bruto —exento, 0%, letra C, o precios
 * ya netos— el reparto da el importe de cada línea sin tocar nada: la
 * proporción es 1 y el resto es cero.
 */
function repartirNetoEntreLineas(
  enProceso: ReadonlyArray<Omit<LineaCalculada, "neto" | "netoUnitario"> & { clave: number }>,
  grupos: ReadonlyMap<number, { readonly bruto: Money }>,
  netoPorClave: ReadonlyMap<number, Money>,
): LineaCalculada[] {
  /** Cuántas líneas de cada grupo quedan por resolver, y cuánto neto sobra. */
  const pendientes = new Map<number, number>();
  for (const l of enProceso) pendientes.set(l.clave, (pendientes.get(l.clave) ?? 0) + 1);
  const restante = new Map(netoPorClave);

  return enProceso.map(({ clave, ...linea }) => {
    const brutoGrupo = grupos.get(clave)?.bruto ?? linea.importe;
    const sobra = restante.get(clave) ?? linea.importe;
    const quedan = (pendientes.get(clave) ?? 1) - 1;
    pendientes.set(clave, quedan);

    // La última línea del grupo se lleva lo que quede: así cierra exacto.
    const neto = quedan === 0 || brutoGrupo.esCero()
      ? sobra
      : linea.importe.multiplicarPor(sobra.aDecimalString(4)).dividirPor(brutoGrupo.aDecimalString(4)).redondear(2);
    restante.set(clave, sobra.restar(neto));

    const cantidad = Money.desde(linea.cantidad);
    return {
      ...linea,
      neto,
      netoUnitario: cantidad.esCero() ? neto : neto.dividirPor(linea.cantidad).redondear(2),
    };
  });
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
  const recargoGlobal = opciones.recargoPorcentaje ?? 0;
  validarPorcentaje(recargoGlobal, "El recargo global");

  const letra = letraDe(opciones.tipo);
  const tieneIva = letra === "A" || letra === "B";

  /** Las líneas mientras se arman, antes de conocer el neto de cada grupo. */
  const enProceso: Array<Omit<LineaCalculada, "neto" | "netoUnitario"> & { clave: number }> = [];
  let brutoSinDescAcum = Money.cero();
  // Suma de importes tras descuentos pero ANTES del recargo (para reportar montos).
  let sinRecargoAcum = Money.cero();

  // Grupos por alícuota, acumulando importes de línea YA redondeados.
  //
  // La clave es el porcentaje, y lo exento (`null`) va a una clave propia que
  // ningún porcentaje puede ocupar: si se agrupara con el 0% quedarían mezclados
  // dos tratamientos fiscales distintos —el 0% lleva renglón ante ARCA, el
  // exento no— y se perdería justamente la distinción que da sentido a esto.
  const grupos = new Map<number, { readonly alicuota: AlicuotaIva | null; bruto: Money }>();

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
    const trasDescuentos = trasDescLinea.restar(trasDescLinea.porcentaje(descuentoGlobal));
    const brutoFinal = trasDescuentos.sumar(trasDescuentos.porcentaje(recargoGlobal));
    const importe = brutoFinal.redondear(2);
    sinRecargoAcum = sinRecargoAcum.sumar(trasDescuentos.redondear(2));

    const clave = linea.alicuota === null ? CLAVE_EXENTO : linea.alicuota.porcentaje;

    enProceso.push({
      descripcion: linea.descripcion,
      cantidad: cantidad.aDecimalString(3),
      precioUnitario: linea.precioUnitario,
      alicuota: linea.alicuota,
      descuentoPorcentaje: descLinea,
      importe,
      clave,
    });

    brutoSinDescAcum = brutoSinDescAcum.sumar(brutoLista);

    const grupo = grupos.get(clave);
    if (grupo === undefined) {
      grupos.set(clave, { alicuota: linea.alicuota, bruto: importe });
    } else {
      grupo.bruto = grupo.bruto.sumar(importe);
    }
  }

  // Descomposición de IVA por grupo de alícuota.
  const subtotalesPorAlicuota: SubtotalPorAlicuota[] = [];
  /** El neto de cada grupo, para repartirlo después entre sus líneas. */
  const netoPorClave = new Map<number, Money>();
  let netoGravado = Money.cero();
  let iva = Money.cero();

  for (const [clave, { alicuota, bruto }] of grupos) {
    let neto: Money;
    let ivaGrupo: Money;

    if (!tieneIva || alicuota === null || alicuota.porcentaje === 0) {
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
    netoPorClave.set(clave, neto);
    netoGravado = netoGravado.sumar(neto);
    iva = iva.sumar(ivaGrupo);
  }

  const lineasCalc = repartirNetoEntreLineas(enProceso, grupos, netoPorClave);

  const sumaImportes = lineasCalc.reduce((acc, l) => acc.sumar(l.importe), Money.cero());
  const brutoSinDescuento = brutoSinDescAcum.redondear(2);
  const sinRecargo = sinRecargoAcum.redondear(2);
  const descuento = brutoSinDescuento.restar(sinRecargo);
  const recargo = sumaImportes.restar(sinRecargo);
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
    recargo,
    netoGravado,
    iva,
    impuestosInternos: Money.cero(),
    total,
  };
}
