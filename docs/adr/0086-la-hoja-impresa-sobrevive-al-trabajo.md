# ADR-0086: La hoja impresa sobrevive al trabajo de impresión

- **Estado:** Aceptada
- **Fecha:** 2026-10-12
- **Decisores:** Equipo NexoSoft
- **Relacionada:** ADR-0084 (el papel y ARCA dicen lo mismo; el portal a `<body>`),
  ADR-0043 (impresión A4 del comprobante)

## Contexto

El 12/10/2026 Sebastián quiso **reimprimir y exportar a PDF** un comprobante
desde Comprobantes. El sistema quedó colgado: el "Guardar como" de Windows en
*(No responde)* y, detrás, un cartel de Windows diciendo **"Microsoft Edge
WebView2 no responde — si cierras el programa, podrías perder información"**.
Pasó tres veces en veinte minutos, con el ticket chico y con el A4, y con
comprobantes distintos. El comprobante se renderizaba perfecto en la vista
previa: lo que se colgaba era el guardado.

En el checklist ya había un síntoma más suave de lo mismo, bajado de prioridad:
*"«Microsoft Print to PDF» dejó de funcionar desde el POS — se elige, y el
archivo no se guarda ni avisa nada"*.

### Cómo llegó el código hasta acá

`useImpresion` monta la hoja en el DOM, le pone una clase al `<body>` que la
hace visible bajo `@media print`, y llama a `window.print()`. Después hay que
desarmar las dos cosas. **Cuándo** es la pregunta, y ya se había contestado mal
una vez:

1. **Justo después de `window.print()`** — se descartó porque `window.print()`
   no está garantizado que bloquee (MDN lo marca como no estandarizado), y con
   WebView2 devolvía el control antes de armar la vista previa: salían "un par
   de letras y una línea" en vez del comprobante.
2. **En `afterprint`** — la corrección de entonces, y es lo que estaba. Mejor,
   pero **todavía temprano**.

`afterprint` se dispara al **cerrar la vista previa**, no al terminar el
trabajo. Entre una cosa y la otra está todo lo que importa: guardar el PDF,
mandar el trabajo a la cola, que el driver lea las páginas. Durante todo eso
seguimos desmontando el documento que el motor está leyendo.

## Decisión

**La limpieza queda pendiente y se salda en el primero de dos momentos, los dos
posteriores al trabajo con certeza:**

1. **Al empezar la impresión siguiente.** Si hay otra, la anterior terminó. Es
   la única señal confiable que tenemos.
2. **Pasado un plazo de gracia largo** (60 s) desde que se cerró la vista
   previa. Esto es higiene, no corrección: evita que una instalación que
   imprime una vez por día quede para siempre en modo impresión.

Dejar la hoja montada mientras tanto **no se ve**: en pantalla está
`display:none` y sólo aparece bajo `@media print`.

La decisión vive en `componentes/limpieza-de-impresion.ts`, aparte del hook, por
dos razones: es lo único que se puede testear sin un DOM —los tests del POS son
de lógica pura, no hay jsdom— y porque es **una sola limpieza pendiente para
toda la app**. No puede haber dos impresiones en curso, así que la del ticket
salda la que dejó la del A4 y viceversa.

### Lo que NO se eligió, y por qué importa

**No se achicó el problema poniendo un plazo corto.** Un `setTimeout` de dos
segundos después de `afterprint` habría tapado el caso de Seba y roto el de la
térmica con la cola llena. El plazo es el respaldo, no el mecanismo.

**No se quitó el portal a `<body>`** de ADR-0084. Es tentador culparlo —es
reciente y mueve el nodo— pero el problema no es dónde vive la hoja sino
cuándo la sacamos. Sacarlo traería de vuelta el duplicado con otra tipografía.

## Consecuencias

### Positivas
- El motor de impresión siempre encuentra el documento mientras lo necesita.
- Un test cubre exactamente lo que falló: que cerrar la vista previa **no**
  dispare la limpieza.
- Alcanza igual al ticket, al A4 y a la credencial: los tres usan el hook.

### Negativas / costos
- La hoja del último comprobante impreso **queda montada en el DOM** hasta la
  impresión siguiente o hasta que venza el plazo. Es invisible y no pesa, pero
  es estado que antes no quedaba.
- La clase de modo impresión queda puesta ese mismo rato. Sólo tiene efecto
  dentro de `@media print`, y la impresión siguiente pone la suya.
- **No está confirmado que esto sea LA causa del cuelgue.** Es *una* causa real
  que controlamos y que explica también el síntoma viejo del archivo que no se
  guardaba. La otra candidata es el diálogo de archivos de Windows trabándose
  al enumerar una carpeta sincronizada con OneDrive —el cuelgue mostraba
  *"Estamos trabajando en ello…"* sobre la carpeta Descargas— y ésa no la
  arregla ningún cambio nuestro. Se verifica en campo guardando en otra
  carpeta.

## Alternativas consideradas

- **Generar el PDF nosotros** en vez de usar `window.print()`, con un diálogo
  nativo de Tauri para elegir dónde guardarlo. Es la solución de fondo para
  "exportar a PDF" —no dependería del ciclo de impresión del webview— pero es
  bastante más trabajo y no arregla la impresión a papel, que usa el mismo
  camino. Queda anotado si el cuelgue sobrevive a este cambio.
- **No limpiar nunca**, dejando la hoja montada para siempre. Más simple, pero
  rompe la impresión de respaldo de la tarjeta de confirmación, que depende de
  que no haya ninguna clase de modo impresión puesta.
