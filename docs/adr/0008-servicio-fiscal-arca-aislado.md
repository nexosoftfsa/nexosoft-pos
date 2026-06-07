# ADR-0008: Servicio fiscal ARCA aislado tras una interfaz

- **Estado:** Aceptada
- **Fecha:** 2026-06-07

## Contexto

La integración con ARCA (WSAA + WSFEv1) es compleja, sensible (certificados
X.509, firma, CAE) y **no se puede probar en este entorno** (sin certificados ni
conectividad). No debe contaminar el resto del sistema ni bloquear el desarrollo
offline-first.

## Decisión

Toda la lógica fiscal vive en `@nexosoft/fiscal`, detrás de la interfaz
**`ServicioFiscal`** (patrón puerto/adaptador):
- `ArcaServicioFiscal`: **WSAA** (firma y cacheo del Ticket de Acceso) +
  **WSFEv1** (solicitud de CAE para Facturas A/B/C, NC/ND).
- `MockServicioFiscal`: simula CAE/errores para desarrollo y tests sin red.
- **Reintentos idempotentes**: una emisión no genera comprobantes duplicados.
- Manejo de **certificados fuera del repo** (`/secrets`, ignorada) y cifrados en
  reposo en producción.
- Estados de comprobante: `PENDIENTE_CAE` → `AUTORIZADA` | `RECHAZADA`.

## Consecuencias

### Positivas
- El POS y el backend dependen del **contrato**, no de SOAP/WSFEv1.
- Se desarrolla y testea todo el flujo con el mock; ARCA se enchufa después.
- Aislamiento de seguridad del manejo de certificados.

### Negativas / costos
- El mock debe reflejar fielmente reglas de ARCA (numeración, validaciones) para
  que el cambio a real sea de bajo riesgo.
- Falta validación contra **homologación** real antes de producción (documentado
  como pendiente).

## Alternativas consideradas

- **Llamar a ARCA directamente desde los módulos de venta** — acopla, complica
  tests y dispersa el manejo de certificados.
- **SDK/servicio de terceros de facturación** — posible, pero perdemos control y
  agregamos dependencia/costos; reevaluable.
