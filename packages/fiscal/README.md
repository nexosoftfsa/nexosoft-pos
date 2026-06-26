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
| `arca-servicio-fiscal.ts` | `ArcaServicioFiscal` (WSAA+WSFEv1) + `codigoComprobanteArca` + endpoints. **Requiere certificado.**         |

## Estado de la integración real (ARCA)

`MockServicioFiscal` cubre **todo el flujo** (dev y tests). `ArcaServicioFiscal`
está **documentado pero no implementado**: la emisión real necesita

1. **Certificado X.509 + clave privada** y un **CUIT habilitado** (homologación o
   producción), **fuera del repo** (`/secrets`, cifrados en reposo).
2. **WSAA**: armar y firmar el TRA en CMS/PKCS#7, `LoginCms`, cachear el TA (~12 h).
3. **WSFEv1**: `FECAESolicitar` (mapeando importes, IVA por alícuota y `CbtesAsoc`
   en NC/ND) y `FECompUltimoAutorizado`.

Hasta entonces, `ArcaServicioFiscal` lanza un error claro y se usa el mock. El salto
a real es de **bajo riesgo** porque el mock ya valida como ARCA.

## Comandos

```bash
pnpm --filter @nexosoft/fiscal test       # vitest
pnpm --filter @nexosoft/fiscal typecheck   # tsc --noEmit
pnpm --filter @nexosoft/fiscal lint        # eslint
```

> Estado: **Fase 2.1/2.2** — interfaz + mock + esqueleto ARCA (12 tests). Próximo:
> integrar al flujo de venta (`PENDIENTE_CAE → AUTORIZADA`) y Notas de Crédito/Débito.
