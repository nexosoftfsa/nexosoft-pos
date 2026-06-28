/**
 * Helpers de presentación. Los montos llegan del backend como string con 2
 * decimales (dinero exacto, ADR-0007); acá solo se formatean para mostrar.
 */

const FORMATO_MONEDA = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
});

/** Formatea un importe (string del backend) como moneda argentina. */
export function formatearMoneda(valor: string): string {
  const n = Number(valor);
  return Number.isFinite(n) ? FORMATO_MONEDA.format(n) : valor;
}

/** Formatea una cantidad entera con separador de miles. */
export function formatearCantidad(valor: number): string {
  return new Intl.NumberFormat("es-AR").format(valor);
}

/** `2026-06-28` → `28/06` (etiqueta corta para ejes de gráficos). */
export function fechaCorta(iso: string): string {
  const [, mes, dia] = iso.split("-");
  return dia && mes ? `${dia}/${mes}` : iso;
}

/** Nombres legibles de los medios de pago (enum del backend). */
const ETIQUETAS_MEDIO_PAGO: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA_DEBITO: "Tarjeta débito",
  TARJETA_CREDITO: "Tarjeta crédito",
  MERCADOPAGO_QR: "MercadoPago QR",
  CUENTA_CORRIENTE: "Cuenta corriente",
};

export function etiquetaMedioPago(codigo: string): string {
  return ETIQUETAS_MEDIO_PAGO[codigo] ?? codigo;
}
