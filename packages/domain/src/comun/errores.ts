/**
 * Errores de dominio explícitos.
 *
 * Regla (CLAUDE.md §7): los errores de negocio son explícitos y no se mezclan
 * con el caso feliz. Estas clases distinguen una violación de regla de negocio
 * (esperable, p. ej. pagos insuficientes) de un error de programación
 * (p. ej. operar dinero de distinta moneda).
 */

/** Base de todos los errores de dominio de NexoSoft. */
export class ErrorDominio extends Error {
  /** Código estable para identificar el error en logs/UI (no traducible). */
  readonly codigo: string;

  constructor(codigo: string, mensaje: string) {
    super(mensaje);
    this.name = new.target.name;
    this.codigo = codigo;
    // Mantiene la cadena de prototipos correcta al transpilar a ES2022.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Operación inválida sobre `Money` (moneda distinta, valor no numérico, etc.). */
export class ErrorMoneda extends ErrorDominio {
  constructor(mensaje: string) {
    super("DINERO_INVALIDO", mensaje);
  }
}

/** Violación de una regla fiscal (condición/comprobante incompatibles). */
export class ErrorFiscal extends ErrorDominio {
  constructor(codigo: string, mensaje: string) {
    super(codigo, mensaje);
  }
}

/** Violación de una regla de cobro (pagos insuficientes, monto negativo, etc.). */
export class ErrorPago extends ErrorDominio {
  constructor(codigo: string, mensaje: string) {
    super(codigo, mensaje);
  }
}
