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

  /** Descuento global sobre el total (además de los descuentos por ítem). */
  @IsNumberString()
  @IsOptional()
  descuento?: string;

  /** Tipo de comprobante (FacturaA/B/C…). Por defecto B si no se envía. */
  @IsString()
  @IsOptional()
  tipoComprobante?: string;
}
