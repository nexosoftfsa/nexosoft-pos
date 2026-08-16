import { IsOptional, IsDateString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Rango de fechas (u horas) para los reportes. Ambos límites son opcionales:
 * si no se indican, el servicio usa los últimos 30 días.
 *
 * Formato: `YYYY-MM-DD` (la fecha `hasta` se interpreta INCLUSIVE, es decir,
 * abarca todo ese día) o `YYYY-MM-DDTHH:mm` para acotar por hora (en ese caso
 * `hasta` es el instante exacto elegido, no un día completo).
 */
export class RangoFechasDto {
  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;
}

/** Rango + límite de filas para el ranking de productos. */
export class TopProductosDto extends RangoFechasDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limite?: number;
}

/** Umbral de saldo para el reporte de stock bajo. */
export class StockBajoDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  umbral?: number;
}
