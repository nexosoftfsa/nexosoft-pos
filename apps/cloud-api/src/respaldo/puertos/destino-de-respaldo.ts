/**
 * Puerto del subsistema de respaldo (ADR-0020).
 *
 * Un `DestinoDeRespaldo` sabe persistir, listar y recuperar snapshots de la
 * base. Las implementaciones son intercambiables:
 *  - `DestinoCarpeta`   → filesystem (sirve para disco local, NAS, o la carpeta
 *                          sincronizada de Google Drive / OneDrive Desktop).
 *  - `DestinoEnMemoria` → mock funcional para tests.
 *  - `DestinoNubeAPI`   → (futuro) OAuth a Google Drive / Microsoft Graph.
 */

export interface MetadatosRespaldo {
  /** Nombre del archivo de respaldo, ej. `nexosoft-2026-06-26T10-30-00-000Z.json.gz`. */
  nombre: string;
  /** Momento de creación. */
  creadoEn: Date;
  /** Tamaño en bytes del contenido comprimido. */
  tamanoBytes: number;
}

export interface DestinoDeRespaldo {
  /** Persiste un respaldo (contenido ya comprimido) bajo el nombre dado. */
  escribir(nombre: string, contenido: Buffer): Promise<void>;

  /** Recupera el contenido de un respaldo por nombre. */
  leer(nombre: string): Promise<Buffer>;

  /** Lista los respaldos disponibles, del más nuevo al más viejo. */
  listar(): Promise<MetadatosRespaldo[]>;

  /** Elimina un respaldo por nombre. */
  eliminar(nombre: string): Promise<void>;
}

/** Token de inyección para el destino activo (resuelto por configuración). */
export const DESTINO_DE_RESPALDO = Symbol('DESTINO_DE_RESPALDO');
