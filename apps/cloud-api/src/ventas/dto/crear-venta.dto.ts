import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsNumberString,
  IsInt,
  IsISO8601,
  IsArray,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MedioPago } from '@prisma/client';

export class ItemVentaDto {
  @IsString()
  @IsNotEmpty()
  productoId!: string;

  @IsNumberString()
  cantidad!: string;

  /** Precio con el que se vendió (puede diferir del actual: la venta ya ocurrió). */
  @IsNumberString()
  precioUnitario!: string;

  @IsNumberString()
  @IsOptional()
  descuento?: string;

  /**
   * Costo neto del producto al momento de la venta (snapshot, ADR-0048). Igual
   * que `precioUnitario`, la venta ya ocurrió: no se recalcula server-side.
   */
  @IsNumberString()
  @IsOptional()
  costoUnitario?: string;
}

/** Un pago de la venta (pago combinado: varios medios en una misma venta). */
export class PagoVentaDto {
  @IsEnum(MedioPago)
  medioPago!: MedioPago;

  @IsNumberString()
  monto!: string;

  /**
   * Trazabilidad de tarjeta configurada (Fase 12.E, ADR-0050): qué tarjeta y
   * cuántas cuotas eligió el cajero, y el recargo ya incluido en `monto`.
   */
  @IsString()
  @IsOptional()
  tarjetaConfigId?: string;

  @IsInt()
  @IsOptional()
  cuotas?: number;

  @IsNumberString()
  @IsOptional()
  recargo?: string;
}

export class CrearVentaDto {
  /** Generado en el POS local; garantiza idempotencia en la sincronización. */
  @IsString()
  @IsNotEmpty()
  operacionId!: string;

  @IsEnum(MedioPago)
  medioPago!: MedioPago;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ItemVentaDto)
  items!: ItemVentaDto[];

  /**
   * Desglose de pagos (pago combinado). Opcional y retrocompatible: si no viene,
   * la venta usa el `medioPago` único. Si viene, se persiste el detalle y el
   * `medioPago` resumen queda COMBINADO cuando hay más de un medio.
   */
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => PagoVentaDto)
  pagos?: PagoVentaDto[];

  /** Descuento global sobre el total (además de los descuentos por ítem). */
  @IsNumberString()
  @IsOptional()
  descuento?: string;

  /** Recargo global sobre el total (ej. financiación por tarjeta), como monto. */
  @IsNumberString()
  @IsOptional()
  recargo?: string;

  /** Tipo de comprobante (FacturaA/B/C…). Por defecto B si no se envía. */
  @IsString()
  @IsOptional()
  tipoComprobante?: string;

  /** Caja que originó la venta. El POS lo completa desde 4.6. */
  @IsString()
  @IsOptional()
  terminalId?: string;

  /** Cliente de la venta (obligatorio si se paga con cuenta corriente). */
  @IsString()
  @IsOptional()
  clienteId?: string;

  /**
   * Cuándo ocurrió la venta, en ISO 8601. La manda el POS porque una venta
   * offline puede llegar horas o días después: sin esto se registraba con la
   * fecha de la sincronización, y eso mandaba la venta al turno de caja
   * equivocado, al día equivocado en los reportes y con un `CbteFch` que no
   * coincidía con el ticket del cliente. Ver `fecha-de-venta.ts`.
   *
   * Opcional por retrocompatibilidad: un POS viejo no la manda y la venta se
   * registra con la hora del servidor, como antes.
   */
  @IsISO8601()
  @IsOptional()
  fecha?: string;
}
