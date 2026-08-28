# @nexosoft/fiscal

Integración fiscal **ARCA** (ex AFIP) **aislada** detrás de la interfaz
`ServicioFiscal` (ADR-0008). El resto del sistema pide CAE contra este **contrato**,
nunca contra SOAP/WSFEv1.

## Contenido

| Módulo                    | Qué expone                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `servicio-fiscal.ts`      | `ServicioFiscal` (puerto), `SolicitudCae`, `ResultadoCae`, `DocTipo`, `MensajeArca`, `ComprobanteAsociado`. |
| `solicitud.ts`            | `construirSolicitudCae(resultado, comprobante, receptor)`: mapea el cálculo del dominio a la solicitud.     |
| `mock-servicio-fiscal.ts` | `MockServicioFiscal`: simula ARCA **respetando sus reglas** (numeración, total=neto+IVA, C sin IVA).        |
| `arca-servicio-fiscal.ts` | Re-exporta `codigoComprobanteArca` y apunta a dónde vive la integración real. |

## Dónde está la integración real (ARCA)

**En el servidor, no en este paquete**: `apps/cloud-api/src/fiscal/arca/`
(`wsaa.ts`, `wsfev1.ts`, `tra.ts`, `firma-cms.ts`). Está implementada y cubre
WSAA, `FECAESolicitar`, `FECompUltimoAutorizado` y `FECompConsultar`, con
`CbtesAsoc` en NC/ND y desglose de IVA por alícuota (ADR-0058).

Vive ahí porque necesita el certificado X.509 del comercio, que está fuera del
repo y **nunca sale de esa máquina**: cada comercio factura con el suyo.

Este paquete sigue siendo el dueño del **contrato** (`ServicioFiscal`) y del
`MockServicioFiscal`, que es con lo que se desarrolla y se testea sin red — y
con lo que vende un comercio que todavía no está de alta en ARCA.

## Comandos

```bash
pnpm --filter @nexosoft/fiscal test       # vitest
pnpm --filter @nexosoft/fiscal typecheck   # tsc --noEmit
pnpm --filter @nexosoft/fiscal lint        # eslint
```

> Estado: interfaz + mock. La emisión real contra ARCA está hecha en
> `apps/cloud-api` (ADR-0058) y todavía **sin probar contra ARCA de verdad**.
