# ADR-0034: Lotes y vencimientos con consumo FEFO

- **Estado:** Aceptada
- **Fecha:** 2026-07-05
- **Decisores:** Equipo NexoSoft (decisión del usuario)
- **Relacionada:** ADR-0015 (control de stock), ADR-0033 (combos)

## Contexto

La Fase 8.2 suma **lotes y vencimientos** para los productos perecederos
(lácteos, fiambres, etc.): el comercio necesita saber qué stock vence pronto y
que las ventas consuman primero lo que caduca antes.

## Decisión

1. **`requiereLote` opcional por producto** (flag en `Producto`, default `false`).
   Solo los perecederos se gestionan por lotes; el resto sigue con stock simple,
   sin fricción extra. Decisión del usuario sobre "obligatorio para todos".
2. **`Lote`** (por sucursal: `numero?`, `fechaVencimiento`, producto). El **saldo
   de un lote se deriva de sus `MovimientoStock`** (nuevo `loteId?` en el
   movimiento): ENTRADA/AJUSTE suman, SALIDA/VENTA restan. No se guarda un saldo
   materializado (consistente con el stock a nivel producto, que ya es un delta).
3. **ENTRADA de un perecedero abre un lote** con su vencimiento; la **SALIDA y la
   VENTA consumen lotes por FEFO** (First-Expire-First-Out: vence antes, sale
   antes). El algoritmo es una **función pura** (`asignarFefo`) testeable sin base.
4. **Vencidos = solo alerta, no bloquean** (decisión del usuario): `GET
   /stock/vencimientos?dias=N` lista los lotes con saldo > 0 vencidos o próximos a
   vencer; la venta nunca se traba por un vencimiento.
5. **La venta ya ocurrida no se pierde**: si al sincronizar una venta los lotes no
   alcanzan a cubrir la cantidad (p. ej. lotes mal cargados), se imputa lo que hay
   por FEFO y el **sobrante queda como un movimiento sin lote** (el stock a nivel
   producto sigue correcto). La **salida manual** (SALIDA por el ABM de stock) sí
   rechaza (400) si los lotes no alcanzan, porque el usuario puede corregir.
6. **La anulación restaura al mismo lote**: la Nota de Crédito espeja los
   movimientos VENTA reales **con su `loteId`**, devolviendo la mercadería al lote
   del que salió.

## Consecuencias

- Trazabilidad de vencimientos y rotación correcta (FEFO) sin cargar lotes en los
  productos que no vencen.
- El saldo a nivel producto y la suma de saldos de sus lotes coinciden (todo
  movimiento de un perecedero lleva `loteId`, salvo el sobrante excepcional).
- Los reportes/alertas de vencimiento reflejan stock real (las ventas consumen
  lotes).

## Alcance

- **8.2.a (esta entrega):** backend — schema (`requiereLote`, `Lote`,
  `MovimientoStock.loteId`), `StockService` (ENTRADA con lote, SALIDA FEFO, lista
  de lotes, alertas de vencimiento), **VENTA con FEFO** en `VentasService` y
  restauración por lote en la anulación, + `requiereLote` en el ABM de catálogo.
- **8.2.b ✅:** POS — checkbox "perecedero" en el ABM de catálogo; el módulo de
  Stock pide vencimiento + N° de lote en la ENTRADA de un perecedero, muestra un
  badge "Lote", una vista de lotes por producto y un **panel de alertas de
  vencimiento** (KPI "Lotes por vencer" + lista vencido/crítico/próximo). La
  SALIDA avisa que consume por FEFO (no se elige lote). Clientes `ClienteStock`
  (HTTP + simulado con FEFO/alertas). **Los lotes son un concepto server-side**:
  la venta offline del POS descuenta a nivel producto y el FEFO de lote lo hace el
  servidor al sincronizar; no se tocó el dominio offline.

## Alternativas consideradas

- **Lote obligatorio para todos los productos** — descartado: obliga a cargar
  vencimiento hasta en artículos que no vencen (ferretería, bebidas), fricción
  innecesaria.
- **FEFO con override manual del lote en la venta** — descartado para el MVP: más
  UI/complejidad en el momento de vender. FEFO automático es igual de rápido que
  hoy.
- **Bloquear la venta de un lote vencido** — descartado (decisión del usuario):
  solo se alerta; el dueño decide (una fecha mal cargada no debe trabar la caja).
- **Saldo de lote materializado** — descartado: se deriva de los movimientos, como
  el stock a nivel producto (una sola fuente de verdad).
