// Puertos
export type { ImpresoraTermica, DatosTicket, LineaTicket, SubtotalIva, EstadoImpresora } from "./impresora.js";
export type { LectorDeBarras, CallbackEscaneo } from "./lector.js";
export type { Balanza, EstadoBalanza } from "./balanza.js";
export { ErrorBalanza } from "./balanza.js";

// ESC/POS (impresión térmica real; el transporte lo pone el adaptador)
export {
  construirEscPos,
  comandoImagenRaster,
  aAsciiImprimible,
  envolver,
  filaIzquierdaDerecha,
  centrar,
  pesosTicket,
  COLUMNAS_58MM,
  PUNTOS_POR_COLUMNA,
} from "./escpos.js";
export type { LogoRaster } from "./escpos.js";

// Mocks (usados en desarrollo y tests)
export { MockImpresoraTermica, MockLectorDeBarras, MockBalanza } from "./mocks/index.js";
