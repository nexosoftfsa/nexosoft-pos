# ADR-0035: Convertir un presupuesto en una venta real

- **Estado:** Aceptada
- **Fecha:** 2026-07-05
- **Decisores:** Equipo NexoSoft (decisión del usuario)
- **Relacionada:** ADR-0031 (presupuestos), ADR-0033/0034 (combos/lotes)

## Contexto

Los presupuestos (ADR-0031) hasta ahora sólo cambiaban de estado: "Convertir"
marcaba `CONVERTIDO` pero **no generaba la venta**. El comercio necesita que
aceptar un presupuesto genere la venta de verdad (descuente stock, emita
comprobante, quede en los reportes).

## Decisión

1. **`PresupuestosService.convertir` genera una venta real reusando
   `VentasService.registrar`** (no se duplica la lógica de venta): calcula
   totales, descuenta stock —incluye la expansión de combos (ADR-0033) y el FEFO
   de lotes (ADR-0034)—, emite comprobante con CAE mock y registra en el libro.
2. **Todos los ítems deben referenciar un producto del catálogo.** Las líneas
   libres (sin `productoId`) no pueden mover stock ni ser ítem de venta → si el
   presupuesto tiene alguna, la conversión se rechaza (400) con un mensaje claro.
3. **Idempotencia**: la venta usa `operacionId = "presup-<id>"`, y la conversión
   está guardada por el estado (`VIGENTE` → `CONVERTIDO`), así que no se puede
   convertir dos veces.
4. `convertir` devuelve `{ presupuesto, venta }`; el POS muestra el comprobante
   generado.

## Consecuencias

- Aceptar un presupuesto es una venta más: baja el stock y aparece en caja y
  reportes, con trazabilidad al presupuesto por el `operacionId`.
- El medio de pago de la venta generada es EFECTIVO por defecto (un flujo de
  cobro más rico se puede agregar sin cambiar el modelo).

## Alternativas consideradas

- **Duplicar la lógica de venta en el módulo de presupuestos** — descartado:
  reusar `VentasService.registrar` mantiene una sola fuente de verdad (stock,
  combos, lotes, CAE, libro).
- **Convertir dejando las líneas libres como ítems sin producto** — descartado:
  `ItemVenta.productoId` es obligatorio y sin producto no hay stock que mover;
  mejor rechazar con un mensaje explícito.
