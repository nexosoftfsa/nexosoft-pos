/**
 * @nexosoft/licencias
 *
 * Suscripción mensual: contrato de la licencia, estados y ventana de gracia
 * (ADR-0056). Puro — sin criptografía ni red, para que lo puedan consumir
 * tanto el `cloud-api` como el POS (que corre en un navegador).
 *
 * La verificación de la firma Ed25519 vive en `cloud-api`.
 */
export {
  EstadoSuscripcion,
  PERMITIDO_BLOQUEADA,
  type EstadoLicencia,
  type Licencia,
} from "./licencia";
export { evaluarLicencia } from "./evaluar-licencia";
export {
  ETIQUETA_PLAN,
  ORDEN_PLANES,
  PLAN_MINIMO,
  Plan,
  alcanzaPlan,
  esModuloId,
  esPlan,
  moduloDisponible,
  planDeLicencia,
  planQueLoHabilita,
  type ModuloId,
} from "./plan";
export {
  MockProveedorLicencias,
  licenciaActiva,
  type ProveedorLicencias,
} from "./proveedor-licencias";
