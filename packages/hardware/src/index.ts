// Puertos
export type { ImpresoraTermica, DatosTicket, LineaTicket, SubtotalIva, EstadoImpresora } from "./impresora.js";
export type { LectorDeBarras, CallbackEscaneo } from "./lector.js";
export type { Balanza, EstadoBalanza } from "./balanza.js";
export { ErrorBalanza } from "./balanza.js";

// Mocks (usados en desarrollo y tests)
export { MockImpresoraTermica, MockLectorDeBarras, MockBalanza } from "./mocks/index.js";
