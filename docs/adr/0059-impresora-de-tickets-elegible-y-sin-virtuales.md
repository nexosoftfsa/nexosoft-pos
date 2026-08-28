# ADR-0059 — La impresora de tickets se elige por terminal, y las virtuales se rechazan

- **Estado:** aceptado
- **Fecha:** 2026-08-28

## Contexto

En una PC de prueba aparecieron archivos `Ticket NexoSoft (1).pdf`,
`(2)`, … hasta `(27)`, y ninguno abría: Adobe Acrobat decía que no era un tipo
de archivo admitido o estaba dañado.

No estaban dañados. Eran **bytes ESC/POS con extensión `.pdf`**.

La cadena era esta:

1. El POS nunca ofreció elegir impresora. `configurarImpresora()` existía en
   `impresora-escpos.ts` pero **ninguna pantalla la llamaba**, así que el nombre
   guardado siempre estaba vacío.
2. Con el nombre vacío, `imprimir_escpos` caía en la impresora **predeterminada
   de Windows**, que en esa PC era "Microsoft Print to PDF".
3. El POS le mandaba a ese driver los comandos de una térmica, en modo `RAW`.
   El driver los escribía crudos dentro de un archivo.
4. `WritePrinter` devolvía éxito y todos los bytes escritos, así que
   `imprimir_raw` devolvía `Ok(())`.

El paso 4 es el que hace daño. **El POS informaba que había impreso.** No había
error, no había log, no había nada: el cliente se iba sin ticket y el sistema
estaba convencido de que había salido bien. Veintisiete veces.

## Decisión

### Se elige la impresora, y se elige por terminal

Configuración tiene una tarjeta "Impresora de tickets" con la lista de
impresoras instaladas (comando nativo `listar_impresoras`), un aviso cuando la
elegida no sirve, y un botón **"Probar impresora"** que manda un ESC/POS mínimo
—inicializar, una línea, cortar— y sale en papel o falla con un mensaje.

La elección va a `localStorage` y no al servidor: **es de la terminal, no del
comercio**. Cada caja tiene su impresora, y dos cajas del mismo local no
comparten esta configuración.

La prueba de impresión no es un extra: es lo único que cierra el circuito. Este
bug existió porque nadie podía verificar la impresión sin hacer una venta real.

### Mandar ESC/POS a una impresora virtual es un error, no un éxito

`imprimir_raw` mira el puerto y el driver **antes de mandar un solo byte**, y
corta con un mensaje que nombra la impresora y dice dónde cambiarla.

Se mira **primero el puerto**, porque es independiente del idioma de Windows:
"Microsoft Print to PDF" y "Microsoft XPS Document Writer" usan `PORTPROMPT:` en
cualquier localización, y también se descartan `FILE:`, `NUL` y `SHRFAX:`. El
nombre del driver (`pdf`, `xps`, `onenote`, `fax`, `document writer`, `print
to`) es el respaldo para las virtuales de terceros tipo PDFCreator o Bullzip.

Se eligió esta detección y no una lista de nombres conocidos porque los nombres
cambian con el idioma y con cada producto nuevo; el puerto no.

`verificarEstado()` hace la misma comprobación, así que el problema se puede
detectar **antes** de la primera venta y no después de la vigésimo séptima.

## Consecuencias

- Un comercio sin térmica configurada ahora ve un error claro en vez de generar
  archivos ilegibles en silencio.
- Una térmica legítima con driver "Generic / Text Only" o en puerto `COM`,
  `USB`, IP o compartida sigue funcionando: la detección apunta a las virtuales,
  no a lo raro.
- Queda un riesgo residual: una impresora virtual de terceros con un driver que
  no diga nada parecido a PDF pasaría el filtro. La prueba de impresión la
  agarra igual, porque no sale nada en papel.
- La lista de impresoras sólo existe en Windows y dentro de la app instalada; en
  el navegador de desarrollo la tarjeta lo dice y no falla.
