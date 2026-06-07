/**
 * @nexosoft/hardware
 * Abstracciones de periféricos de comercio detrás de interfaces (ADR-0009).
 * El POS depende de estos puertos; el transporte real (USB/serial) vive en la
 * capa nativa de Tauri.
 *
 * Puertos previstos:
 *  - Impresora (ESC/POS): impresión de tickets/comprobantes.
 *  - Balanza: lectura de peso (protocolos por marca/modelo).
 *  - Lector de código de barras: entrada por teclado (HID) o serial.
 *
 * Cada puerto tendrá una implementación real y un Mock funcional para tests.
 * Ver ADR-0009.
 */
export const HARDWARE_PACKAGE = "@nexosoft/hardware";
