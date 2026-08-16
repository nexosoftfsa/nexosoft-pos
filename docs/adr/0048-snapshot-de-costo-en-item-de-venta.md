# ADR-0048: Snapshot del costo en el ítem de venta, para ganancia real en reportes

- **Estado:** Aceptada
- **Fecha:** 2026-08-15
- **Decisores:** Equipo NexoSoft
- **Relacionada:** ADR-0014 (costeo y marcación por régimen), ADR-0024 (panel web de reportes)

## Contexto

El cliente pidió ver, en Reportes y Estadísticas, cuánto **ganó** en un período
(precio de venta − costo de lo vendido), además del rango de fechas fijo que ya
existía (Hoy/7 días/30 días/Este mes).

El `Articulo` guarda `costoNeto` (ADR-0014), pero es un valor **mutable** del
catálogo: cambia cuando el comercio actualiza precios de compra. Si el reporte de
ganancia calculara el costo de una venta vieja usando el costo **actual** del
producto, el número sería incorrecto apenas el costo cambiara — exactamente lo
que CLAUDE.md prohíbe para cálculos de dinero (sección "Dinero (NO NEGOCIABLE)").

El `item_venta` (SQLite local) y `ItemVenta` (Postgres) solo guardaban el precio
de venta al momento de la operación, no el costo.

## Decisión

- Se agrega `costoNeto` (dominio) / `costo_neto_cent` (SQLite) / `costoUnitario`
  (Postgres, sync) al ítem de venta: una **foto del costo del artículo en el
  momento exacto de la venta**, tomada en `ServicioDeVenta.armar()` del mismo
  `Articulo` ya resuelto para calcular el precio.
- Viaja igual que `precioUnitario` por el pipeline offline-first: se persiste en
  SQLite al confirmar la venta, se sincroniza vía outbox (`costoUnitario` en el
  payload), y `VentasService.registrar()` del backend lo persiste tal cual lo
  manda el POS — la venta ya ocurrió, no se recalcula server-side (mismo
  criterio que ya aplicaba a `precioUnitario`).
- La columna es **nullable** a propósito: las ventas sincronizadas antes de esta
  migración no tienen el snapshot. `ReportesService.rentabilidad()` usa
  `costoUnitario ?? producto.precioCosto` (el costo *actual*) como fallback
  documentado para esos casos — una aproximación aceptada, no un bloqueante.
- Las Notas de Débito (cargos/intereses, sin producto real) snapshotean
  `costoNeto: Money.cero()`: no representan mercadería vendida.

## Consecuencias

### Positivas

- La ganancia de un período pasado no se mueve si después cambia el costo de un
  producto en el catálogo — coherente con el resto del manejo de dinero exacto.
- No rompe compatibilidad: campo nullable, ventas viejas siguen funcionando con
  el fallback.

### Negativas / costos

- Ventas sincronizadas antes de este ADR no tienen ganancia exacta: se
  aproximan con el costo actual del producto (puede estar desviada si el costo
  cambió desde entonces).
- Un campo más viajando en el payload de sync y en el checkout — superficie
  levemente mayor en `ServicioDeVenta`, `mapeo.ts` y `CrearVentaDto`.

## Alternativas consideradas

- **Calcular la ganancia con el costo actual del catálogo, sin snapshot** —
  descartada: da resultados incorrectos y variables en el tiempo para ventas
  pasadas si el costo cambia, violando el criterio de dinero exacto del proyecto.
- **Backfill de costo histórico para ventas ya sincronizadas** — descartada: no
  hay forma de reconstruir el costo real en un momento pasado si no se guardó;
  se documenta el fallback en vez de fingir precisión que no existe.
