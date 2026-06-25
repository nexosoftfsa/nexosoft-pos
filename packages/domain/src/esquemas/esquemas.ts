/**
 * Esquemas de validación (zod) para los bordes del sistema (IPC de Tauri, API,
 * sync). Validan la FORMA cruda de los datos antes de construir value objects de
 * dominio (`Money`, `AlicuotaIva`). El dominio nunca confía en datos sin validar.
 */
import { z } from "zod";

import { TODAS_LAS_ALICUOTAS } from "../fiscal/alicuota-iva.js";
import { CondicionIva } from "../fiscal/condicion-iva.js";
import { TipoLista } from "../catalogo/lista-de-precios.js";
import { UnidadDeMedida } from "../catalogo/unidad-de-medida.js";
import { FormaDePago } from "../ventas/pago.js";

/** Monto como texto decimal (hasta 4 decimales). Preferido para transportar dinero. */
export const esquemaMontoDecimal = z
  .string()
  .regex(/^-?\d+(\.\d{1,4})?$/, "Monto decimal inválido (use punto y hasta 4 decimales).");

/** Cantidad positiva como texto decimal (hasta 3 decimales: soporta fraccionado). */
export const esquemaCantidad = z
  .string()
  .regex(/^\d+(\.\d{1,3})?$/, "Cantidad inválida.")
  .refine((s) => Number(s) > 0, "La cantidad debe ser mayor a cero.");

/** Porcentaje 0..100. */
export const esquemaPorcentaje = z.number().min(0).max(100);

export const esquemaCondicionIva = z.nativeEnum(CondicionIva);

export const esquemaFormaDePago = z.nativeEnum(FormaDePago);

export const esquemaUnidadDeMedida = z.nativeEnum(UnidadDeMedida);

export const esquemaTipoLista = z.nativeEnum(TipoLista);

const PORCENTAJES_ALICUOTA = TODAS_LAS_ALICUOTAS.map((a) => a.porcentaje);

/** Porcentaje de alícuota válido (debe ser una tasa de IVA vigente). */
export const esquemaAlicuotaPorcentaje = z
  .number()
  .refine(
    (p) => PORCENTAJES_ALICUOTA.includes(p),
    `Alícuota de IVA inválida (válidas: ${PORCENTAJES_ALICUOTA.join(", ")}).`,
  );

/** Línea de venta cruda, tal como llega desde la UI/IPC (antes de mapear a dominio). */
export const esquemaLineaVentaEntrada = z.object({
  descripcion: z.string().min(1, "La descripción es obligatoria."),
  cantidad: esquemaCantidad,
  precioUnitario: esquemaMontoDecimal,
  alicuotaPorcentaje: esquemaAlicuotaPorcentaje,
  descuentoPorcentaje: esquemaPorcentaje.optional(),
});

export type LineaVentaEntrada = z.infer<typeof esquemaLineaVentaEntrada>;

/** Pago crudo, tal como llega desde la UI/IPC. */
export const esquemaPagoEntrada = z.object({
  forma: esquemaFormaDePago,
  monto: esquemaMontoDecimal,
  referencia: z.string().optional(),
});

export type PagoEntrada = z.infer<typeof esquemaPagoEntrada>;

/** Alta de artículo cruda, tal como llega desde la UI/IPC. */
export const esquemaArticuloEntrada = z.object({
  codigoInterno: z.string().min(1, "El código interno es obligatorio."),
  descripcion: z.string().min(1, "La descripción es obligatoria."),
  unidadDeMedida: esquemaUnidadDeMedida,
  costoNeto: esquemaMontoDecimal,
  alicuotaPorcentaje: esquemaAlicuotaPorcentaje,
  codigoBarras: z.string().optional(),
  rubroId: z.string().optional(),
  proveedorId: z.string().optional(),
});

export type ArticuloEntrada = z.infer<typeof esquemaArticuloEntrada>;
