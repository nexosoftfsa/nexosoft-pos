import { IsInt, IsNumberString, IsString, IsOptional, MaxLength, Min } from 'class-validator';

export class CerrarTurnoDto {
  /** Efectivo contado físicamente en el arqueo. */
  @IsNumberString()
  montoContado!: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  observaciones?: string;

  /**
   * Cuántas ventas tenía la terminal sin subir en el momento de cerrar. Lo sabe
   * el POS (es el largo de su cola), no el servidor.
   *
   * Con esto el turno puede explicar por qué la diferencia guardada no coincide
   * con el saldo teórico que se ve después: al cerrar, el efectivo de esas
   * ventas estaba en el cajón pero todavía no en el servidor.
   */
  @IsInt()
  @Min(0)
  @IsOptional()
  ventasSinSincronizar?: number;
}
