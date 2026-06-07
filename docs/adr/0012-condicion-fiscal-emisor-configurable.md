# ADR-0012: Condición fiscal del emisor configurable

- **Estado:** Aceptada
- **Fecha:** 2026-06-07

## Contexto

NexoSoft debe servir a comercios con distinta condición frente a ARCA. El
comerciante quiere **seleccionar su condición fiscal**; el sistema debe adaptar
los comprobantes y el tratamiento de IVA en consecuencia (no hardcodear RI).

## Decisión

Configuración **`condicionIvaEmisor`** a nivel comercio/sucursal
(`ResponsableInscripto` | `Monotributo` | …). El tipo de comprobante se resuelve
con una **función pura** del dominio en `@nexosoft/domain`:

```
resolverTipoComprobante(condicionEmisor, condicionReceptor) -> TipoComprobante
```

Reglas iniciales:
- **Emisor RI:** Factura **A** a receptor RI; Factura **B** a Consumidor Final /
  Monotributo / Exento. IVA **discriminado**.
- **Emisor Monotributo:** Factura **C** (IVA **no** discriminado).
- Notas de Crédito/Débito siguen la letra del comprobante asociado.

La emisión (WSFEv1) y la discriminación de IVA dependen de esta configuración;
el `MockServicioFiscal` la respeta para que el salto a ARCA real sea de bajo riesgo.

## Consecuencias

### Positivas
- Un solo producto sirve a RI y Monotributo; sin builds separados.
- Regla de comprobante centralizada y testeable (matriz emisor × receptor).

### Negativas / costos
- Más caminos a cubrir con tests; las validaciones de WSFEv1 difieren por letra.
- Hay que mantener la matriz actualizada ante cambios normativos de ARCA.

## Alternativas consideradas

- **Hardcodear RI** — descartado: limita el mercado objetivo.
- **Un build/configuración por condición** — descartado: duplica y complica el deploy.
