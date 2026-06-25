/**
 * `Cantidad`: value object para cantidades de stock/venta con decimales exactos.
 *
 * No es dinero (no tiene moneda), pero comparte el rigor: las cantidades se
 * acumulan a lo largo de muchos movimientos de stock y usar `number` (float)
 * produciría deriva (0,1 + 0,2 ≠ 0,3). Soporta fraccionado/peso (3 decimales por
 * defecto: hasta el gramo). Es inmutable.
 */
import Decimal from "decimal.js";

import { ErrorDominio } from "./errores.js";

const Numero = Decimal.clone({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -15,
  toExpPos: 30,
});

/** Decimales por defecto al redondear/serializar una cantidad. */
const ESCALA_POR_DEFECTO = 3;

export type ValorCantidad = string | number | Decimal;

function aDecimalSeguro(valor: ValorCantidad): Decimal {
  const entrada = typeof valor === "number" ? String(valor) : valor;
  try {
    const d = new Numero(entrada);
    if (!d.isFinite()) {
      throw new ErrorDominio("CANTIDAD_INVALIDA", `Cantidad no finita: ${String(valor)}`);
    }
    return d;
  } catch (e) {
    if (e instanceof ErrorDominio) throw e;
    throw new ErrorDominio("CANTIDAD_INVALIDA", `Cantidad inválida: ${String(valor)}`);
  }
}

export class Cantidad {
  private readonly valor: Decimal;

  private constructor(valor: Decimal) {
    this.valor = valor;
  }

  static cero(): Cantidad {
    return new Cantidad(new Numero(0));
  }

  static de(valor: ValorCantidad): Cantidad {
    return new Cantidad(aDecimalSeguro(valor));
  }

  sumar(otra: Cantidad): Cantidad {
    return new Cantidad(this.valor.plus(otra.valor));
  }

  restar(otra: Cantidad): Cantidad {
    return new Cantidad(this.valor.minus(otra.valor));
  }

  /** Multiplica por un factor (p. ej. unidades por bulto). */
  multiplicarPor(factor: ValorCantidad): Cantidad {
    return new Cantidad(this.valor.times(aDecimalSeguro(factor)));
  }

  negada(): Cantidad {
    return new Cantidad(this.valor.neg());
  }

  redondear(decimales: number = ESCALA_POR_DEFECTO): Cantidad {
    return new Cantidad(this.valor.toDecimalPlaces(decimales, Decimal.ROUND_HALF_UP));
  }

  igualA(otra: Cantidad): boolean {
    return this.valor.equals(otra.valor);
  }

  mayorQue(otra: Cantidad): boolean {
    return this.valor.greaterThan(otra.valor);
  }

  mayorOIgualQue(otra: Cantidad): boolean {
    return this.valor.greaterThanOrEqualTo(otra.valor);
  }

  menorQue(otra: Cantidad): boolean {
    return this.valor.lessThan(otra.valor);
  }

  menorOIgualQue(otra: Cantidad): boolean {
    return this.valor.lessThanOrEqualTo(otra.valor);
  }

  esCero(): boolean {
    return this.valor.isZero();
  }

  esPositiva(): boolean {
    return this.valor.greaterThan(0);
  }

  esNegativa(): boolean {
    return this.valor.lessThan(0);
  }

  /** ¿Es un número entero? (relevante para artículos vendidos por unidad). */
  esEntera(): boolean {
    return this.valor.isInteger();
  }

  aDecimalString(decimales: number = ESCALA_POR_DEFECTO): string {
    return this.valor.toFixed(decimales, Decimal.ROUND_HALF_UP);
  }

  aNumero(): number {
    return this.valor.toNumber();
  }

  toString(): string {
    return this.aDecimalString();
  }
}
