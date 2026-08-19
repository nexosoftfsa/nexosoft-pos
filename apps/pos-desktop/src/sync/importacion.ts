/** Tipo compartido por los clientes de los módulos que soportan "Importar desde Excel" (Fase 14). */
export interface FilaImportacion {
  readonly fila: number;
  readonly resultado: "creada" | "omitida" | "error";
  readonly mensaje?: string;
  readonly advertencia?: string;
}
