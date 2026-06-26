/**
 * Puerto LectorDeBarras.
 *
 * Los lectores HID (USB plug-and-play) se comportan como teclado: el SO
 * inyecta el código como pulsaciones de tecla seguidas de Enter. El POS puede
 * capturarlos con un listener de teclado global sin ningún driver especial.
 *
 * Los lectores seriales requieren un plugin Tauri que abra el puerto COM y
 * emita los datos al frontend.
 *
 * Para producción habrá que decidir el tipo de conexión del modelo elegido e
 * implementar el adaptador correspondiente.
 */

// ---------------------------------------------------------------------------
// Puerto
// ---------------------------------------------------------------------------

/**
 * Callback invocado cada vez que el lector emite un código.
 * @returns función para cancelar la suscripción.
 */
export type CallbackEscaneo = (codigo: string) => void;

export interface LectorDeBarras {
  /**
   * Registra un listener de escaneos.
   * @returns función `unsubscribe` — llamarla detiene las notificaciones.
   */
  onEscaneo(cb: CallbackEscaneo): () => void;

  /** Libera recursos (cierra puerto serial si aplica). */
  desconectar(): Promise<void>;
}
