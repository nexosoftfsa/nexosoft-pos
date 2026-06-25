/**
 * `Money`: value object de dinero con decimales exactos (ADR-0007).
 *
 * Reglas no negociables:
 *  - Nunca se representa dinero con `number`/`float`. Internamente usa `decimal.js`.
 *  - Redondeo explícito `ROUND_HALF_UP` (salvo regla fiscal específica).
 *  - Inmutable: toda operación devuelve un `Money` nuevo.
 *  - Persistencia: PostgreSQL `NUMERIC(18,4)` (texto decimal); SQLite en enteros
 *    (centavos). Esta clase ofrece `aDecimalString` y `aCentavos` para ambos.
 *
 * El valor interno se guarda SIN redondear, para no perder precisión en cálculos
 * intermedios (p. ej. precio = costo × (1 + utilidad%)). El redondeo a la escala
 * de la moneda se hace de forma explícita con `redondear`, o al serializar.
 */
import Decimal from "decimal.js";

import { ErrorMoneda } from "../comun/errores.js";

/** Constructor de `Decimal` aislado, con la configuración fiscal de NexoSoft. */
const Dinero = Decimal.clone({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
  // Evita notación exponencial en rangos de dinero razonables.
  toExpNeg: -15,
  toExpPos: 30,
});

/** Moneda soportada. El MVP opera solo en pesos argentinos. */
export type Moneda = "ARS";

/** Escala (decimales) por defecto de la moneda al redondear/serializar. */
const ESCALA_POR_DEFECTO = 2;

/** Valores aceptados para construir un `Money`. */
export type ValorMoney = string | number | Decimal;

function aDecimalSeguro(valor: ValorMoney): Decimal {
  // Los `number` se convierten vía string para tomar su representación decimal
  // más corta (p. ej. 1.005 → "1.005") y no su valor binario IEEE-754.
  const entrada = typeof valor === "number" ? String(valor) : valor;
  try {
    const d = new Dinero(entrada);
    if (!d.isFinite()) {
      throw new ErrorMoneda(`Monto no finito: ${String(valor)}`);
    }
    return d;
  } catch (e) {
    if (e instanceof ErrorMoneda) throw e;
    throw new ErrorMoneda(`Monto inválido: ${String(valor)}`);
  }
}

export class Money {
  /** Valor exacto sin redondear. */
  private readonly valor: Decimal;
  readonly moneda: Moneda;

  private constructor(valor: Decimal, moneda: Moneda) {
    this.valor = valor;
    this.moneda = moneda;
  }

  // --- Fábricas -------------------------------------------------------------

  /** Cero en la moneda indicada. */
  static cero(moneda: Moneda = "ARS"): Money {
    return new Money(new Dinero(0), moneda);
  }

  /** Crea un `Money` desde texto decimal (preferido), `number` o `Decimal`. */
  static desde(valor: ValorMoney, moneda: Moneda = "ARS"): Money {
    return new Money(aDecimalSeguro(valor), moneda);
  }

  /** Crea un `Money` desde una cantidad entera de centavos (fuente: SQLite). */
  static desdeCentavos(centavos: number | bigint, moneda: Moneda = "ARS"): Money {
    const n = typeof centavos === "bigint" ? centavos.toString() : centavos;
    if (typeof n === "number" && !Number.isInteger(n)) {
      throw new ErrorMoneda(`Los centavos deben ser enteros: ${n}`);
    }
    return new Money(new Dinero(n).div(100), moneda);
  }

  // --- Operaciones (inmutables) --------------------------------------------

  private mismaMoneda(otro: Money): void {
    if (this.moneda !== otro.moneda) {
      throw new ErrorMoneda(
        `No se pueden operar montos de distinta moneda: ${this.moneda} vs ${otro.moneda}`,
      );
    }
  }

  sumar(otro: Money): Money {
    this.mismaMoneda(otro);
    return new Money(this.valor.plus(otro.valor), this.moneda);
  }

  restar(otro: Money): Money {
    this.mismaMoneda(otro);
    return new Money(this.valor.minus(otro.valor), this.moneda);
  }

  /** Multiplica por una cantidad (p. ej. 1,250 kg). No es dinero, es un factor. */
  multiplicarPor(cantidad: ValorMoney): Money {
    return new Money(this.valor.times(aDecimalSeguro(cantidad)), this.moneda);
  }

  /** Divide por un factor escalar. Útil para descomponer IVA incluido. */
  dividirPor(divisor: ValorMoney): Money {
    const d = aDecimalSeguro(divisor);
    if (d.isZero()) throw new ErrorMoneda("División por cero");
    return new Money(this.valor.div(d), this.moneda);
  }

  /** Devuelve el importe correspondiente a un porcentaje (p. ej. IVA 21%). */
  porcentaje(porcentaje: ValorMoney): Money {
    return new Money(this.valor.times(aDecimalSeguro(porcentaje)).div(100), this.moneda);
  }

  /**
   * Proporción (ratio) de este monto respecto de una `base`, como `number`.
   * Para porcentajes/márgenes de display (NO es dinero): p. ej. 150/100 = 1.5.
   */
  proporcionRespectoDe(base: Money): number {
    this.mismaMoneda(base);
    if (base.valor.isZero()) {
      throw new ErrorMoneda("No se puede calcular una proporción sobre base cero.");
    }
    return this.valor.div(base.valor).toNumber();
  }

  /** Signo invertido. */
  negado(): Money {
    return new Money(this.valor.neg(), this.moneda);
  }

  /** Valor absoluto. */
  absoluto(): Money {
    return new Money(this.valor.abs(), this.moneda);
  }

  /** Redondea a la escala indicada (por defecto, la de la moneda) HALF_UP. */
  redondear(decimales: number = ESCALA_POR_DEFECTO): Money {
    return new Money(this.valor.toDecimalPlaces(decimales, Decimal.ROUND_HALF_UP), this.moneda);
  }

  // --- Comparaciones --------------------------------------------------------

  igualA(otro: Money): boolean {
    return this.moneda === otro.moneda && this.valor.equals(otro.valor);
  }

  mayorQue(otro: Money): boolean {
    this.mismaMoneda(otro);
    return this.valor.greaterThan(otro.valor);
  }

  mayorOIgualQue(otro: Money): boolean {
    this.mismaMoneda(otro);
    return this.valor.greaterThanOrEqualTo(otro.valor);
  }

  menorQue(otro: Money): boolean {
    this.mismaMoneda(otro);
    return this.valor.lessThan(otro.valor);
  }

  menorOIgualQue(otro: Money): boolean {
    this.mismaMoneda(otro);
    return this.valor.lessThanOrEqualTo(otro.valor);
  }

  esCero(): boolean {
    return this.valor.isZero();
  }

  esPositivo(): boolean {
    return this.valor.greaterThan(0);
  }

  esNegativo(): boolean {
    return this.valor.lessThan(0);
  }

  // --- Serialización --------------------------------------------------------

  /** Texto decimal con escala fija (destino: PostgreSQL NUMERIC, display). */
  aDecimalString(decimales: number = ESCALA_POR_DEFECTO): string {
    return this.valor.toFixed(decimales, Decimal.ROUND_HALF_UP);
  }

  /** Entero de centavos (destino: SQLite). Redondea a 2 decimales HALF_UP. */
  aCentavos(): number {
    return this.valor.times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  }

  /** Representación serializable estable (IPC Tauri, JSON). */
  aJSON(): { moneda: Moneda; monto: string } {
    return { moneda: this.moneda, monto: this.aDecimalString() };
  }

  /** Reconstruye un `Money` desde su forma `aJSON`. */
  static desdeJSON(json: { moneda: Moneda; monto: string }): Money {
    return Money.desde(json.monto, json.moneda);
  }

  toString(): string {
    return `${this.moneda} ${this.aDecimalString()}`;
  }
}
