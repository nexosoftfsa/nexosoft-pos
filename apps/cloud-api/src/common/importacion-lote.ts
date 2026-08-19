/**
 * Tipos compartidos por los endpoints de importación masiva desde Excel
 * (Fase 14: Catálogo, Proveedores, Stock, Medios de pago, Usuarios). Cada
 * service tiene su propio método `importarXxx()` con la misma forma:
 * procesa cada fila de forma independiente (una fila con error no aborta
 * el resto) adentro de una transacción, y con `dryRun: true` la
 * transacción SIEMPRE se revierte al final (tirando este sentinel con el
 * reporte ya armado, atrapado afuera) para que el preview use exactamente
 * la misma lógica de validación que la corrida real, sin duplicar código.
 */
export type ResultadoFilaImportacion =
  | { fila: number; resultado: 'creada'; advertencia?: string }
  | { fila: number; resultado: 'omitida'; mensaje: string }
  | { fila: number; resultado: 'error'; mensaje: string };

export class RevertirDryRun extends Error {
  constructor(readonly resultados: ResultadoFilaImportacion[]) {
    super('dry-run: revertir');
  }
}
