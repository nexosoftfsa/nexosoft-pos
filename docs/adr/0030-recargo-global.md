# ADR-0030: Recargo global en el comprobante

- **Estado:** Aceptada
- **Fecha:** 2026-07-02
- **Decisores:** Equipo NexoSoft
- **Relacionada:** ADR-0013 (cálculo de comprobante), ADR-0029 (pago combinado)

## Contexto

La Fase 7.8 sigue con **recargos** (ej. financiación por tarjeta). El cálculo del
comprobante (`calcularComprobante`) soportaba `descuentoPorcentaje` global pero
dejaba el recargo explícitamente para "fases siguientes".

## Decisión

1. **Recargo global como porcentaje**, simétrico al descuento global: se agrega
   `recargoPorcentaje` a `OpcionesCalculo` y un campo `recargo: Money` a
   `ResultadoComprobante`. Se aplica **por línea, después de los descuentos**, de
   modo que la descomposición de IVA se hace sobre el importe ya recargado y se
   mantiene la invariante `netoGravado + iva = total`.
2. **Se reportan por separado** `descuento` (monto quitado) y `recargo` (monto
   agregado), calculados contra la suma de importes tras descuentos y antes del
   recargo. Un recargo NO vuelve negativo al `descuento`.
3. **Wiring**: `ComandoVenta.recargoPorcentaje` → `ServicioDeVenta` → cálculo. El
   POS lo expone en el ticket (botones Sin/10%/15%) y envía el **monto** de
   recargo al backend; `CrearVentaDto.recargo` (opcional) y
   `total = subtotal − descuento + recargo`. Retrocompatible.

## Consecuencias

- El recargo queda en el total de forma fiscalmente consistente (IVA incluido).
- Reusa la maquinaria del descuento global; cambio contenido y testeado.
- El backend recibe el recargo como monto ya calculado por el dominio (única
  fuente de verdad del cálculo).

## Alternativas consideradas

- **Recargo sobre el total, sin re-discriminar IVA** — descartado: rompería la
  invariante `netoGravado + iva = total` en Factura A.
- **Recargo por medio de pago automático** (tabla de tasas por medio) — diferido:
  por ahora el recargo es manual en el ticket; una tabla de recargos por medio es
  evolución futura.
