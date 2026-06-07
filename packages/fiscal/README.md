# @nexosoft/fiscal

Servicio de integración con **ARCA (ex AFIP)**, completamente aislado detrás de
una interfaz (`ServicioFiscal`). El resto del sistema nunca habla SOAP/WSFEv1
directamente: depende del puerto, no de la implementación (ADR-0008).

## Responsabilidades

- **WSAA**: firma del Ticket de Acceso con certificado X.509, cacheo y renovación.
- **WSFEv1**: solicitud de **CAE** para Facturas A/B/C, Notas de Crédito/Débito.
- Reintentos **idempotentes** y manejo de estados (pendiente / autorizada / rechazada).

## Implementaciones

| Implementación        | Uso                                            |
| --------------------- | ---------------------------------------------- |
| `ArcaServicioFiscal`  | Producción/homologación contra ARCA real       |
| `MockServicioFiscal`  | Desarrollo y tests sin red (CAE simulado)      |

> En este entorno **no se puede probar contra ARCA real** (requiere certificados
> y conectividad). Por eso la integración va detrás de interfaz + mock funcional
> con tests; en el README se documentará qué falta para producción.

## Estado

🔜 Fase 2. En Fase 0 queda declarado el contrato y la estrategia (ADR-0008).
