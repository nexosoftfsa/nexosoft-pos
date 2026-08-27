/**
 * Código de tipo de comprobante en WSFEv1 (`CbteTipo`).
 *
 * Factura A=1 · B=6 · C=11; Nota de Débito A=2 · B=7 · C=12;
 * Nota de Crédito A=3 · B=8 · C=13.
 *
 * Vive en el dominio y no en `@nexosoft/fiscal` porque lo necesitan los dos
 * lados en TIEMPO DE EJECUCIÓN: el POS para armar el QR del ticket y el
 * servidor para pedirle el CAE a ARCA. `@nexosoft/fiscal` todavía se publica
 * como TypeScript sin compilar, y Node no puede cargar eso desde
 * node_modules — es el problema que dejó un servidor sin arrancar en la PC de
 * un cliente. Acá está resuelto: `domain` tiene build de CommonJS.
 */
import { ErrorFiscal } from '../comun/errores.js';
import { letraDe, type TipoComprobante } from './tipo-comprobante.js';

const TABLA: Record<'A' | 'B' | 'C', { factura: number; nc: number; nd: number }> = {
  A: { factura: 1, nc: 3, nd: 2 },
  B: { factura: 6, nc: 8, nd: 7 },
  C: { factura: 11, nc: 13, nd: 12 },
};

export function codigoComprobanteArca(tipo: TipoComprobante): number {
  const letra = letraDe(tipo);
  const base = letra === 'A' ? 'A' : letra === 'B' ? 'B' : letra === 'C' ? 'C' : undefined;
  if (base === undefined) {
    throw new ErrorFiscal(
      'SIN_CODIGO_ARCA',
      `El comprobante "${tipo}" no tiene código WSFEv1 (no es fiscal).`,
    );
  }
  const fila = TABLA[base];
  if (tipo.startsWith('NotaCredito')) return fila.nc;
  if (tipo.startsWith('NotaDebito')) return fila.nd;
  return fila.factura;
}

/** El código de ARCA, o `null` si el comprobante no es fiscal. */
export function codigoComprobanteArcaOpcional(tipo: string | null | undefined): number | null {
  if (tipo === null || tipo === undefined) return null;
  try {
    return codigoComprobanteArca(tipo as TipoComprobante);
  } catch {
    return null;
  }
}
