# ADR-0043: Impresión A4 del comprobante

- **Estado:** Aceptada
- **Fecha:** 2026-08-01
- **Decisores:** Equipo NexoSoft
- **Relacionada:** ADR-0041 (modo sin ARCA), ADR-0009/0018 (hardware por
  puertos y mocks)

## Contexto

El cliente de la Fase 10 tiene, además de la impresora térmica, una impresora
común A4 que usa **hoy** para imprimir algo tipo factura con su sistema
actual (confirmado por el usuario — no es solo para remitos u otro papel
suelto). NexoSoft no tenía ningún camino de impresión A4: solo el ticket
térmico (`DatosTicket` → `ImpresoraTermica`, hoy mock) y, de hecho, el botón
"Imprimir" que ya existía en la reimpresión de comprobantes (`Comprobantes.
tsx`) simplemente hacía `window.print()` sobre el `.ticket` angosto (380px) —
imprimía un ticket chico en el borde de una hoja A4, no una factura.

## Decisión

1. **`window.print()` del navegador**, no un generador de PDF ni una librería
   nueva. Tauri corre sobre WebView2 (Windows), que soporta `window.print()`
   nativamente y abre el diálogo de impresión del sistema operativo — el
   usuario elige ahí la impresora A4. Cero dependencias nuevas.
2. **Reusa `DatosTicket`** (`packages/hardware`, el mismo tipo que ya arma
   `construirDatosTicket` para la impresora térmica) en vez de inventar un
   modelo de datos paralelo — es la fuente de verdad de "qué es un
   comprobante imprimible" en el sistema. Se le sumó `esFiscal?: boolean`
   (Fase 10.1: distingue Factura real de `TicketNoFiscal` para el layout).
3. **Un solo componente presentacional** `ComprobanteA4.tsx` sirve a los dos
   orígenes de datos: la venta recién confirmada en el POS (local,
   `VentaConfirmada`) y la reimpresión desde `Comprobantes` (servidor,
   `Comprobante`). Cada origen tiene su propio adaptador a `DatosTicket`
   (`construirDatosTicket` ya existía; `datosTicketDeComprobante` es nuevo,
   pure y testeado en `comprobantes-helpers.ts`).
4. **Truco CSS estándar "ocultar todo salvo el nodo a imprimir"**, con una
   clase en `<body>` (`modo-impresion-a4`) para no pisar el `@media print` que
   ya existía para `.ticket` — cada botón de impresión revela un target
   distinto. `.hoja-a4` está siempre en el DOM pero `display:none` en pantalla.
5. **`flushSync` (react-dom), no `requestAnimationFrame`**, para forzar el
   render de `.hoja-a4` antes de `window.print()`. Se detectó en la
   verificación con el navegador automatizado que `requestAnimationFrame`
   nunca dispara si la pestaña/ventana no está compositando frames (pane
   oculto) — `flushSync` no depende de eso.
6. **Corrige de paso un desajuste preexistente**, expuesto recién ahora que
   algo renderiza `DatosTicket` de verdad: `condicionIvaEmisor`/
   `condicionIvaReceptor` viajaban como el valor crudo del enum
   (`"ResponsableInscripto"`) en vez de la etiqueta (`"Responsable
   Inscripto"`) — se usa `etiquetaCondicionIva()` del dominio. Mismo caso con
   `tipoComprobante` (ya corregido en la Fase 10.1).

## Consecuencias

- El cliente puede imprimir una factura/ticket con layout de hoja completa
  (encabezado del comercio, ítems, IVA discriminado si corresponde, total,
  formas de pago, CAE o aviso "no válido como factura") desde la venta recién
  confirmada Y desde la reimpresión de comprobantes históricos.
- **Reimpresión con menos detalle que la venta local**: el cloud-api no
  persiste el desglose de IVA por alícuota ni la condición del receptor por
  venta — la reimpresión A4 muestra el total sin discriminar IVA y sin la
  línea "Receptor". No es un bug, es lo que el backend guarda hoy; se podría
  ampliar el schema si hace falta (fuera de alcance de esta fase).
- Verificado en el navegador interceptando `window.print` (evita que el
  diálogo nativo del SO cuelgue la automatización): factura fiscal completa,
  ticket no fiscal con aviso en rojo, y reimpresión con CAE y pago combinado —
  los tres casos con los datos correctos.

## Alternativas consideradas

- **Generar un PDF del lado del cliente** (`jspdf`/similar) — descartado:
  dependencia nueva + mantenimiento de un segundo renderer del comprobante,
  cuando `window.print()` ya resuelve "imprimir en A4" con cero código extra
  de bajo nivel; el usuario elige impresora/tamaño en el diálogo del SO.
- **Abrir una ventana/pestaña nueva con el HTML imprimible** — descartado:
  en Tauri abrir ventanas nuevas es más fricción que ocultar/mostrar un nodo
  en la misma vista, y el patrón "ocultar todo salvo X" ya estaba probado en
  el código (`.ticket`).
