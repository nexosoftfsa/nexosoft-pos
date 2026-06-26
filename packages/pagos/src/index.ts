// Puerto y tipos
export type {
  PasarelaDePago,
  SolicitudPago,
  IntentoPago,
  MedioPagoElectronico,
  EstadoPagoElectronico,
} from "./pasarela.js";
export { ErrorPasarela } from "./pasarela.js";

// Mock (desarrollo y tests)
export { MockPasarelaDePago } from "./mock-pasarela.js";

// Adaptador real (requiere credenciales y SDK de MercadoPago)
export { MercadoPagoPoint, type ConfigMercadoPago } from "./mercadopago-point.js";
