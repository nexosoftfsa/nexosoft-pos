/**
 * Cobro de una venta: una o varias formas de pago (pago combinado), cálculo de
 * vuelto y saldo pendiente.
 *
 * Reglas:
 *  - Una venta puede cobrarse con **varios medios** (efectivo + tarjeta + …).
 *  - El **vuelto** solo puede entregarse en efectivo: nunca se devuelve más
 *    efectivo del que entró por caja.
 *  - Si lo pagado no cubre el total, queda un **saldo pendiente** (lo decide el
 *    POS: típicamente va a cuenta corriente, que se implementa en otra fase).
 *  - El cobro electrónico (tarjeta/billetera) se concreta vía `PasarelaDePago`
 *    (`@nexosoft/pagos`); acá solo se registra el monto y la forma.
 */
import { ErrorPago } from "../comun/errores.js";
import { Money } from "../dinero/money.js";

export const FormaDePago = {
  Efectivo: "efectivo",
  Tarjeta: "tarjeta",
  Billetera: "billetera",
  Transferencia: "transferencia",
  CuentaCorriente: "cuentaCorriente",
} as const;

export type FormaDePago = (typeof FormaDePago)[keyof typeof FormaDePago];

/** Formas con las que se puede entregar vuelto (solo efectivo). */
const FORMAS_CON_VUELTO = new Set<FormaDePago>([FormaDePago.Efectivo]);

export interface Pago {
  readonly forma: FormaDePago;
  readonly monto: Money;
  /** Referencia opcional: id de transacción, últimos 4 dígitos, etc. */
  readonly referencia?: string;
}

export interface ResultadoCobro {
  readonly total: Money;
  /** Suma de todos los pagos. */
  readonly pagado: Money;
  /** Vuelto a entregar en efectivo (0 si no corresponde). */
  readonly vuelto: Money;
  /** Saldo que la venta deja pendiente (0 si quedó cancelada). */
  readonly saldoPendiente: Money;
  /** `true` si lo pagado cubre el total. */
  readonly cancelada: boolean;
}

/** Suma de los montos de una lista de pagos. */
export function totalPagado(pagos: readonly Pago[]): Money {
  return pagos.reduce((acc, p) => acc.sumar(p.monto), Money.cero());
}

/** Suma de los pagos en efectivo (los únicos que admiten vuelto). */
function totalEfectivo(pagos: readonly Pago[]): Money {
  return pagos
    .filter((p) => FORMAS_CON_VUELTO.has(p.forma))
    .reduce((acc, p) => acc.sumar(p.monto), Money.cero());
}

/**
 * Calcula el resultado de cobrar `total` con la lista de `pagos`.
 *
 * @throws {ErrorPago} si algún pago no es positivo, o si el vuelto excede el
 *   efectivo recibido (no se puede dar vuelto de un pago electrónico).
 */
export function calcularCobro(total: Money, pagos: readonly Pago[]): ResultadoCobro {
  if (total.esNegativo()) {
    throw new ErrorPago("TOTAL_INVALIDO", "El total a cobrar no puede ser negativo.");
  }
  for (const p of pagos) {
    if (!p.monto.esPositivo()) {
      throw new ErrorPago(
        "MONTO_PAGO_INVALIDO",
        `El monto de un pago (${p.forma}) debe ser mayor a cero.`,
      );
    }
  }

  const pagado = totalPagado(pagos);

  if (pagado.menorQue(total)) {
    return {
      total,
      pagado,
      vuelto: Money.cero(),
      saldoPendiente: total.restar(pagado),
      cancelada: false,
    };
  }

  // Pagado >= total: hay (posible) vuelto, solo entregable en efectivo.
  const vuelto = pagado.restar(total);
  if (vuelto.esPositivo() && vuelto.mayorQue(totalEfectivo(pagos))) {
    throw new ErrorPago(
      "VUELTO_SIN_EFECTIVO",
      "El vuelto no puede superar el efectivo recibido: no se devuelve cambio de un pago electrónico.",
    );
  }

  return {
    total,
    pagado,
    vuelto,
    saldoPendiente: Money.cero(),
    cancelada: true,
  };
}
