import { IsArray, IsBoolean, IsObject } from 'class-validator';

/** Fase 14.C: una fila cruda tal como llega del Excel (clave = encabezado de columna, valor = texto de la celda). */
export class ImportarProveedoresDto {
  @IsArray()
  @IsObject({ each: true })
  filas!: Record<string, string>[];

  @IsBoolean()
  dryRun!: boolean;
}
