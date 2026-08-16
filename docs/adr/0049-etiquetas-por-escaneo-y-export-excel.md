# ADR-0049: Etiquetas de góndola por escaneo, export a Excel, sin código de barras

- **Estado:** Aceptada
- **Fecha:** 2026-08-15
- **Decisores:** Equipo NexoSoft
- **Relacionada:** Reemplaza parcialmente ADR-0044 (etiquetas de góndola: mismo
  módulo, cambia el método de selección, la salida y quita el código de barras)

## Contexto

El cliente usa un lector de barras inalámbrico para recorrer la góndola y
detectar qué productos necesitan reimprimir etiqueta. El método actual
(buscar + tildar checkbox, ADR-0044) funciona pero es más lento para ese
flujo físico: quiere escanear producto por producto y que la lista se arme
sola, aceptar la lista al final, y que eso se exporte a un Excel ya
acomodado para imprimir. Además pidió explícitamente que la etiqueta **no**
lleve código de barras — solo el nombre del producto en texto chico y el
precio en grande.

## Decisión

- **Dos métodos de selección conviven** en `EtiquetasGondola.tsx`: "Buscar"
  (el flujo existente, sin cambios) y "Escanear" (nuevo). Ambos alimentan el
  mismo estado `Map<productoId, cantidad>`, así que se pueden combinar (por
  ejemplo, escanear la góndola y después buscar manualmente un producto sin
  código a mano).
- El modo escaneo reusa el patrón de captura de lector HID ya probado en
  `PantallaPos.tsx` (buffer de teclas hasta `Enter`, ignora si el foco está
  en un input), extraído a un hook compartido `useLectorTeclado` en
  `usar-lector-teclado.ts` — evita duplicar esa lógica entre las dos
  pantallas que escanean.
- Se **quita el código de barras de la etiqueta** (`CodigoBarrasSvg.tsx` y
  `codigo-barras-ean13.ts` se eliminan, ya sin otro uso en el repo): la
  etiqueta pasa a ser solo nombre (chico) y precio (grande).
- La salida deja de ser una hoja A4 impresa por `window.print()` y pasa a
  ser un **`.xlsx` generado en el cliente con `exceljs`** (misma librería que
  ya usa el backend para el libro de ventas, ADR-0021), descargado con el
  mismo patrón de `descargarBlob` que ya usa `admin-web` para CSV. La grilla
  tiene 3 columnas: una fila de planilla para los nombres, otra para los
  precios (fuente más grande, negrita), y una fila en blanco de separación
  para poder recortar.
- Se elimina el flujo de impresión HTML de etiquetas (`EtiquetaGondola.tsx`,
  `usar-impresion-etiquetas.ts`, clase `modo-impresion-etiquetas` en
  `estilos.css`): la única salida ahora es el Excel, para ambos métodos de
  selección.

## Consecuencias

### Positivas

- El flujo de escaneo es más rápido para el caso de uso real (recorrer la
  góndola con el lector), sin perder la opción de búsqueda manual.
- Un solo camino de salida (Excel) más simple de mantener que dos (HTML +
  lo que viniera después).
- No se agregó ningún plugin nativo de Tauri: la descarga funciona con el
  mismo mecanismo de blob + `<a download>` que ya usa `admin-web`.

### Negativas / costos

- Se pierde la escaneabilidad de la propia etiqueta impresa (ya no tiene
  código de barras): decisión explícita del cliente, documentada acá por si
  se revierte en el futuro.
- Nueva dependencia `exceljs` en `apps/pos-desktop` (ya estaba en
  `apps/cloud-api`, pero no del lado cliente).
- El layout del Excel es un valor por defecto razonable (3 columnas, alturas
  de fila fijas), no una medida exacta de ningún papel — misma situación que
  tenía la grilla HTML anterior, pendiente de ajustar cuando el cliente
  confirme qué imprime.

## Alternativas consideradas

- **Mantener el código de barras en la etiqueta** — descartado: pedido
  explícito del cliente en esta fase.
- **Generar el Excel en el backend y descargarlo** (mismo patrón que el
  libro de ventas) — descartado por ahora: la selección/escaneo ocurre
  enteramente en el POS con el catálogo ya sincronizado localmente, no hay
  necesidad de ida y vuelta al backend para armar un archivo que no depende
  de datos que solo tenga el servidor.
- **Reemplazar la búsqueda manual en vez de sumarle el modo escaneo** —
  descartado: el cliente dijo que el método actual "funciona pero es más
  lento", no que sobre.
