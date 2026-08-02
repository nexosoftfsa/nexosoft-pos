# ADR-0046: Catálogo demo con datos reales del cliente + buscador en la venta

- **Estado:** Aceptada
- **Fecha:** 2026-08-02
- **Decisores:** Equipo NexoSoft
- **Relacionada:** ADR-0042 (importador de catálogo, misma fuente de datos:
  `Migrar Articulos.xlsx`), ADR-0044 (etiquetas de góndola — primera
  verificación visual real del código de barras EAN-13)

## Contexto

La maqueta/demo (navegador y "modo demo" del instalable) usaba un catálogo
de 8 productos inventados ("Gaseosa 1,5 L" a $1.850, etc.). El usuario pidió
reemplazarlo por los 711 artículos reales del cliente de la Fase 10 (mismos
datos que ya se usan para migrar su catálogo real) para que una demo a un
prospecto muestre productos y precios reales, no ficticios.

Cargar 711 productos en la grilla de venta (que antes listaba todos los
artículos como botones, sin filtro) hacía la pantalla impracticable de
recorrer a mano — se decidió (con el usuario) sumar un buscador en esa
misma pantalla en vez de recortar el catálogo a una selección chica.

## Decisión

1. **`catalogo-demo-711.json`** (generado por
   `apps/pos-desktop/scripts/generar-catalogo-demo.py`, Python, mismo patrón
   que `apps/cloud-api/scripts/padron/`) reemplaza el array `DEFS` hardcodeado
   en `datos/bootstrap.ts`. Es la fuente de catálogo para: la demo del
   navegador (`crearEntornoPos`), el "modo demo" del instalable (`AppDemo`) y
   el fallback offline de Tauri si no hay servidor (`sembrarCatalogoDemoSiVacio`).
2. **5 códigos reales quedan mapeados a ids fijos** (`alfajor`/`gaseosa`/
   `cafe`/`leche`/`pan`) porque otro código los referencia **por nombre**, no
   por dato: el combo demo "Combo Merienda" (`cafe`+`alfajor`),
   `PROMOS_DEMO` (`componentes/promos.ts`, 3x2 alfajor / 15% gaseosa), y los
   perecederos con lotes de vencimiento (`leche`/`pan` en
   `cliente-stock-simulado.ts` y `cliente-catalogo-admin-simulado.ts`).
   Sin este mapeo, esas 4 features demo se hubieran roto en silencio (o, en
   el caso de los lotes, con una excepción real: `ClienteStockSimulado`
   busca el producto por id y tira si no lo encuentra).
3. **El rubro real viaja hasta `Articulo.rubroId`** (`crearArticulo(...,
   rubroId: rubroASlug(d.rubro))`, nueva función `rubroASlug` en
   `bootstrap.ts`) y `cliente-catalogo-admin-simulado.ts` deriva sus
   categorías DINÁMICAMENTE de los rubros presentes en `DEFS`, en vez de un
   mapa estático de 3 categorías por id de producto (que solo cubría los 8
   productos viejos). Sin esto, 708 de 711 productos hubieran quedado sin
   categoría en la demo del ABM de catálogo.
4. **Buscador en la pantalla de venta** (`PantallaPos.tsx`): input de texto
   que filtra por código interno, código de barras o descripción
   (`filtrarCatalogoVenta`, pura y testeada en `pos-helpers.ts`). Mejora
   tanto la demo como el POS real del cliente (que también tiene 711
   artículos) — no es una feature "solo demo".
5. **Stock ≤ 0 del Excel real se sube a 5** en la demo (no en la migración
   real del cliente, ADR-0042 — ahí el stock negativo/cero se respeta tal
   cual está documentado). En la demo no tiene sentido mostrar quiebres de
   stock reales de un archivo exportado en un momento dado.

## Consecuencias

- La demo/maqueta muestra productos y precios 100% reales (mismos que se
  migran al cliente), sin inventar nada — más creíble para un prospecto.
- Verificado en el navegador de punta a punta: catálogo real cargado (711),
  buscador funcionando, combo intacto, categorías reales en el ABM (22
  rubros), alertas de vencimiento de leche/pan intactas, y **primera
  verificación visual real del código de barras EAN-13** de la Fase 10.5
  (antes solo probado por tests, ahora confirmado con un código real: SVG de
  152×28 con 47 barras, coincide con el patrón esperado de 95 módulos).
- Bundle de la demo creció (~442 KB → 574 KB gzip 149 KB) por el JSON
  embebido — aceptable para una app de escritorio, sin impacto medible.
- **Deuda menor no resuelta:** los mocks de Presupuestos/Remitos/Ventas/
  Reportes (`sync/cliente-*-simulado.ts`, salvo Stock y Catálogo) siguen con
  datos de ejemplo propios y desconectados del catálogo real (ids/códigos
  viejos tipo "7790007") — no crashean (son objetos literales, no dependen
  de `DEFS`), pero muestran info ligeramente inconsistente con el resto de
  la demo. No se tocaron: son pantallas secundarias, no el foco del pedido.

## Alternativas consideradas

- **Selección representativa (~25-30 productos)** — mi recomendación
  inicial, más simple y sin tocar la pantalla de venta. El usuario prefirió
  el catálogo completo + buscador, más fiel al cliente real y con una mejora
  que también sirve al POS real.
- **Recategorizar productos demo a mano por id** (como estaba) — descartado
  al pasar a 711 productos: imposible de mantener a mano: 711 entradas en un
  mapa estático. La derivación dinámica desde el rubro real del Excel es la
  única opción que escala.
