# ADR-0044: Etiquetas de góndola

- **Estado:** Aceptada
- **Fecha:** 2026-08-01
- **Decisores:** Equipo NexoSoft
- **Relacionada:** ADR-0043 (impresión A4, mismo patrón de impresión), ADR-0042
  (catálogo importado — fuente de los códigos reales)

## Contexto

El cliente de la Fase 10 pidió explícitamente esta función: su sistema actual
imprime etiquetas para góndola (precio + código de cada producto) y la quiere
también en NexoSoft. Es la última sub-fase de la Fase 10, y la que más se
apoya en las anteriores: usa el catálogo real importado (10.2) y el mismo
mecanismo de impresión armado para la factura A4 (10.4).

## Decisión

1. **Mismo patrón de impresión que la Fase 10.4** (`window.print()`, "ocultar
   todo salvo el nodo a imprimir"). Se generalizó el hook de esa fase
   (`usar-impresion-a4.ts`) en uno genérico, `usar-impresion.ts`
   (`useImpresion<T>(claseBody)`), y `useImpresionA4`/`useImpresionEtiquetas`
   quedaron como wrappers finos — evita duplicar la lógica de `flushSync` +
   toggle de clase en `<body>` + `window.print()`.
2. **Código de barras EAN-13 codificado a mano, sin dependencia nueva**
   (`codigo-barras-ean13.ts`, ~90 líneas, algoritmo público de GS1): dado que
   el catálogo real (Fase 10.2) trae códigos de 13 dígitos para el 89% de los
   711 artículos, vale la pena mostrar la barra real (no solo el número) para
   que el personal pueda re-escanear la etiqueta. Se probó contra un EAN-13
   real conocido (ejemplo de Wikipedia/GS1, dígito verificador 1) y contra un
   código real del catálogo importado ("7790310985113", verificador 3) —
   ambos coinciden. Códigos que no son numéricos de 12/13 dígitos (los ~78
   códigos internos cortos del sistema anterior, o EAN-8) **no dibujan barra**:
   la etiqueta muestra el código como texto solamente, sin inventar un
   símbolo inválido.
3. **Pantalla de selección nueva** (`EtiquetasGondola.tsx`, menú "Gestión",
   mismo gateo por rol que Catálogo/Stock — ADMIN/SUPERVISOR): busca/filtra
   el catálogo real (`ClienteCatalogoAdmin.listarProductos`, el mismo puerto
   online que ya usa el ABM de catálogo — no hay un catálogo paralelo para
   esto), permite tildar productos y ajustar cuántas copias de cada etiqueta
   (un mismo producto puede necesitar varias copias para distintas puntas de
   góndola). La lógica de armar la lista plana a imprimir y de filtrar por
   texto/rubro quedó pura y testeada (`etiquetas-gondola-helpers.ts`).
4. **Grilla de 3 columnas en A4, recortable con tijera** (borde punteado, sin
   asumir papel autoadhesivo pre-troquelado): no sabemos qué papel de
   etiquetas tiene o va a comprar el cliente, así que el layout es agnóstico
   del troquelado — el tamaño (`grid-template-columns` en `.hoja-etiquetas`,
   `.etiqueta` en `estilos.css`) es lo primero para ajustar cuando se sepa el
   papel real.

## Consecuencias

- El cliente puede imprimir etiquetas de precio con código de barras real
  (escaneable) para cualquier subconjunto del catálogo recién importado,
  desde el mismo sistema, sin depender de su sistema anterior para esto.
- Verificado en el navegador: selección múltiple, cantidades por producto
  (2 copias de un artículo + 1 de otro → "Imprimir 3 etiquetas" → 3 nodos de
  etiqueta con los datos correctos), y la codificación EAN-13 verificada por
  tests contra códigos reales (no se pudo probar el renderizado visual de la
  barra en el navegador automatizado porque los datos demo no traen EAN-13
  reales de 13 dígitos — la lógica de codificación en sí está cubierta).
- Tamaño/columnas de la grilla son un valor por defecto razonable, NO una
  medida exacta de un papel de etiquetas real — ajustar cuando el cliente
  confirme qué hojas usa (misma situación que la impresora térmica, Fase
  10.3, pendiente de esos datos).

## Alternativas consideradas

- **Librería de códigos de barras (`jsbarcode`, `bwip-js`)** — descartada:
  agrega una dependencia para un algoritmo de ~90 líneas ya estandarizado
  (GS1 EAN-13) y testeado contra casos reales; menos superficie, mismo
  resultado para el símbolo que de verdad se necesita acá.
- **CODE128** (soporta cualquier código, no solo EAN-13 numérico de 12/13) —
  descartado por ahora: hubiera cubierto también los códigos internos cortos,
  pero la tabla de codificación es bastante más grande; con el 89% del
  catálogo real ya con EAN-13 válido, no se justificó el esfuerzo extra para
  esta fase. Queda documentado como mejora posible si hace falta.
- **Reusar `.hoja-a4` para las etiquetas** (una sola hoja imprimible genérica)
  — descartado: la grilla de etiquetas necesita re-renderizar N veces según
  la selección, con una estructura de grid distinta a la de una factura; más
  simple tener su propio componente y clase de impresión.
