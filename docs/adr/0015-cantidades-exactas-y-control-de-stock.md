# ADR-0015: Cantidades exactas y control de stock negativo

- **Estado:** Aceptada
- **Fecha:** 2026-06-25
- **Decisores:** Equipo NexoSoft

## Contexto

El stock plantea dos decisiones:

1. **Cómo representar las cantidades.** Hay artículos fraccionados/por peso
   (1,250 kg) y el stock se actualiza sumando/restando **muchos** movimientos. Con
   `number` (float) la cantidad **deriva** (0,1 + 0,2 ≠ 0,3), igual que el dinero.
2. **Qué hacer ante un egreso que dejaría stock negativo.** Algunos comercios
   quieren **bloquearlo** (no vender lo que no hay); otros aceptan **sobreventa**
   (vender y regularizar después). No se puede imponer una sola política.

## Decisión

- Value object **`Cantidad`** (en `@nexosoft/domain`), análogo a `Money` pero sin
  moneda, respaldado por `decimal.js` (3 decimales por defecto). Inmutable. Toda
  cantidad de stock/lote es `Cantidad`, **nunca `number`**.
- La existencia se mantiene como **snapshot** (`Existencia`) y, además, queda el
  **historial** (`MovimientoDeStock`). `calcularExistencia` puede reconstruir el
  snapshot desde el historial (auditoría).
- Cada movimiento lleva **cantidad positiva**; el **signo lo da el `tipo`**
  (compra/devolución/ajuste+ suman; venta/merma/ajuste− restan).
- `aplicarMovimiento` **bloquea stock negativo por defecto**; la sobreventa se
  habilita explícitamente con `permitirNegativo` (configurable por comercio).
- Lotes con **vencimiento** y descuento **FEFO** (First Expired, First Out).

## Consecuencias

### Positivas

- Cantidades exactas y sin deriva, con la misma rigurosidad que el dinero.
- El historial de movimientos da trazabilidad y permite recomputar existencias.
- Política de stock negativo configurable: un solo motor sirve a ambos comercios.
- FEFO reduce pérdidas por vencimiento.

### Negativas / costos

- Otro value object con su API (no se opera con aritmética nativa).
- El snapshot y el historial pueden divergir si algo escribe solo uno; el backend
  debe mantener ambos en la misma transacción (se aborda al persistir en 1.4).

## Alternativas consideradas

- **Cantidades con `number`** — descartado: deriva por acumulación, igual que el
  dinero con float.
- **Solo historial (event sourcing puro), sin snapshot** — descartado para el MVP:
  sumar todo el historial en cada venta es caro en el POS; el snapshot lo evita.
- **Bloquear siempre el stock negativo** — descartado: excluye a comercios que
  operan con sobreventa controlada.
