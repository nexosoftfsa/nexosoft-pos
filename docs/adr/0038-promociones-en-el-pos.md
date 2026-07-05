# ADR-0038: Promociones (2x1 / %) aplicadas en el POS

- **Estado:** Aceptada
- **Fecha:** 2026-07-05
- **Decisores:** Equipo NexoSoft (decisión del usuario)
- **Relacionada:** ADR-0013 (cálculo de comprobante), ADR-0029 (pago combinado)

## Contexto

El dominio ya tenía el modelo y el evaluador de promociones
(`calcularDescuentoPromocion`: %, monto fijo, lleva/paga) desde la Fase 1, pero
sin cablear al POS. Faltaba **seleccionar** la promo que aplica a cada línea y
**reflejar el descuento** en la venta.

## Decisión

1. **La selección de promos vive en el POS** (`componentes/promos.ts`): dado el
   conjunto de promos vigentes, `promoAplicable` elige la primera cuyo ámbito
   (artículos/rubros) y vigencia matchean la línea. El **cálculo** del descuento
   sigue en el dominio (puro, testeado).
2. **El descuento se aplica por línea**: se convierte a `descuentoPorcentaje` del
   ítem para el cálculo local del dominio, y viaja como `descuento` (monto) por
   ítem en el payload de sync, para que el backend recalcule el mismo total.
3. **Para la demo, las promos están definidas en el POS** (`PROMOS_DEMO`: "3x2 en
   Alfajores", "15% en Gaseosas") apuntando a los artículos del catálogo demo. En
   producción se cargarían del servidor (admin de promos = evolución futura); en
   Tauri, con ids de producto reales, `PROMOS_DEMO` simplemente no matchea (inerte).

## Consecuencias

- El cajero ve la promo y el ahorro en cada línea del ticket, y el total ya viene
  con el descuento; la venta sincronizada llega con el mismo total (descuento por
  ítem en el payload).
- Reusa el evaluador del dominio: una sola fuente de verdad del cálculo.

## Alternativas consideradas

- **Aplicar la promo como descuento global** — descartado: se pierde la trazabilidad
  por línea y no se puede mostrar "qué promo aplicó a qué producto".
- **Definir un admin de promos ahora** — diferido: excede el objetivo (mostrar
  promos funcionando). El modelo del dominio ya soporta cargarlas desde el servidor.
