// Puertos
export type { ImpresoraTermica, DatosTicket, LineaTicket, SubtotalIva, EstadoImpresora } from "./impresora.js";
export type { LectorDeBarras, CallbackEscaneo } from "./lector.js";
export type { Balanza, EstadoBalanza } from "./balanza.js";
export { ErrorBalanza } from "./balanza.js";

// ESC/POS (impresión térmica real; el transporte lo pone el adaptador)
export {
  construirEscPos,
  aAsciiImprimible,
  filaIzquierdaDerecha,
  centrar,
  COLUMNAS_58MM,
} from "./escpos.js";

// Mocks (usados en desarrollo y tests)
export { MockImpresoraTermica, MockLectorDeBarras, MockBalanza } from "./mocks/index.js";
