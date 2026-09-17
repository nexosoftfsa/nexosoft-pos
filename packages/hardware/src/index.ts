// Puertos
export type {
  ImpresoraTermica,
  DatosTicket,
  LineaTicket,
  SubtotalIva,
  EstadoImpresora,
  ComprobanteAsociadoTicket,
  TransparenciaFiscal,
} from "./impresora.js";
export {
  ACLARACION_IMPUESTOS_NACIONALES,
  fechaHoraTicket,
  identificacionComprobanteAsociado,
  letraFiscal,
  LEYENDA_TRANSPARENCIA_FISCAL,
  leyendaNumeroProvisional,
  llevaDatosDelReceptor,
  montoDelSubtotal,
  numeroEsProvisional,
  numeroFiscalFormateado,
  referenciaInterna,
  subtotalNeto,
  transparenciaFiscal,
} from "./impresora.js";
export type { LectorDeBarras, CallbackEscaneo } from "./lector.js";
export type { Balanza, EstadoBalanza } from "./balanza.js";
export { ErrorBalanza } from "./balanza.js";

// ESC/POS (impresión térmica real; el transporte lo pone el adaptador)
export {
  construirEscPos,
  comandoImagenRaster,
  qrARaster,
  aAsciiImprimible,
  envolver,
  filaIzquierdaDerecha,
  centrar,
  pesosTicket,
  COLUMNAS_58MM,
  PUNTOS_POR_COLUMNA,
} from "./escpos.js";
export type { LogoRaster, ModulosQr } from "./escpos.js";

// Mocks (usados en desarrollo y tests)
export { MockImpresoraTermica, MockLectorDeBarras, MockBalanza } from "./mocks/index.js";
