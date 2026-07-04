import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsNumberString,
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
}

/** Un pago de la venta (pago combinado: varios medios en una misma venta). */
export class PagoVentaDto {
  @IsEnum(MedioPago)
  medioPago!: MedioPago;

  @IsNumberString()
  monto!: string;
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
}
