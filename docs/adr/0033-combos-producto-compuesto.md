# ADR-0033: Combos como producto compuesto (descuento de stock por componente)

- **Estado:** Aceptada
- **Fecha:** 2026-07-05
- **Decisores:** Equipo NexoSoft (decisión del usuario)
- **Relacionada:** ADR-0015 (control de stock), ADR-0028 (anulación con NC)

## Contexto

La Fase 8 suma **combos/promos**: agrupar varios productos y venderlos como una
unidad (ej. "Combo Merienda" = café + alfajor). El comercio los da de alta en el
catálogo y los vende como cualquier artículo, pero **el stock que se mueve es el
de los componentes**, no el del combo (el combo no tiene existencia física).

## Decisión

1. **El combo es un `Producto` con `tipo = COMBO`** (enum `TipoProducto` SIMPLE /
   COMBO). Reusa todo el modelo existente: precio, IVA, categoría, alta/baja,
   comprobante. **Precio fijo** definido en el combo (no se recalcula de los
   componentes). Un `Producto` SIMPLE es el default → retrocompatible.
2. **Los componentes viven en una tabla `ComboComponente`** (`comboId`,
   `componenteId`, `cantidad`), con `@@unique(comboId, componenteId)`. Un combo
   necesita ≥1 componente; los componentes deben ser SIMPLE (**no hay combos de
   combos**, así la expansión de stock es de un solo nivel), sin repetir ni
   auto-referenciarse, con cantidad positiva.
3. **Al vender**, el stock se **expande a los componentes**: un ítem SIMPLE genera
   un `MovimientoStock` sobre sí mismo; un ítem COMBO genera uno por componente,
   con `cantidad = (cantidad del ítem) × (cantidad del componente)`. La expansión
   es una **función pura** (`expandirStockDeVenta`) testeable sin base.
4. **Al anular** (ADR-0028), el stock se restaura **espejando los movimientos
   `VENTA` reales** de la venta original (no sus ítems): así un combo devuelve el
   stock de sus componentes exactamente como se descontó, **sin depender de la
   composición actual** del combo (que pudo cambiar después de la venta).
5. **El servidor de sucursal es la fuente de verdad** de esta expansión (ocurre en
   `VentasService.registrar`, donde vive el stock autoritativo y llega la sync).

## Consecuencias

- El comercio arma combos desde el ABM de catálogo (selector de tipo + armador de
  componentes que sólo lista productos SIMPLE) y los vende; el stock de los
  insumos baja solo.
- La anulación de una venta con combo restaura el stock correcto de los insumos.
- El precio del combo es independiente del de sus componentes (permite promo).

## Alcance

- **8.1.a ✅:** combos en el catálogo + expansión de stock al vender y al anular
  **en el cloud-api** + ABM en el POS. Los combos como concepto del servidor.
- **8.1.b ✅:** combo **vendible offline-first** en la pantalla de ventas del POS.
  Se le enseñó combos a la capa de aplicación con un puerto **opcional**
  `RepositorioCombos` (`componentesDe(articuloId)`): `ServicioDeVenta.confirmarVenta`
  resuelve los movimientos de stock **expandiendo el combo a sus componentes**
  (validación + descuento), sin tocar el `Articulo`. Adaptadores en memoria
  (navegador) y SQLite (Tauri, tabla `combo_componente`); el **pull** del catálogo
  trae los combos y sus componentes y **omite la existencia del combo** (no tiene
  stock propio). La venta sigue registrando la **línea del combo** (con su precio);
  solo el stock resuelve a componentes.

## Alternativas consideradas

- **Motor de reglas de precio sobre el carrito** (2x1, "2da unidad al 50%") —
  descartado por ahora: es un subsistema nuevo separado del catálogo. El producto
  compuesto reusa todo lo construido y cubre el caso "combo de productos".
- **Recalcular el precio del combo desde los componentes** — descartado: el valor
  de un combo suele ser promocional (menor que la suma). Precio fijo del combo.
- **Re-expandir el combo al anular usando su composición actual** — descartado:
  frágil si el combo cambió tras la venta. Espejar los movimientos reales es
  exacto e independiente de cambios posteriores.
