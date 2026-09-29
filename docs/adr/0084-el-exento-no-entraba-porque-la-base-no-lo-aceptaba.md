# ADR-0084 — El exento no entraba porque la base no lo aceptaba

Fecha: 2026-09-28
Estado: aceptado

## Contexto

Tres rondas de pruebas de campo con el mismo síntoma: **el catálogo de la
terminal no se actualizaba**. Un producto corregido en el panel —el arroz,
pasado a exento— seguía apareciendo como antes en la caja. Se revisó el
endpoint (devuelve `tipoIva`), el mapeo (`EXENTO` → `null`), el upsert (escribe
NULL) y la lectura (`alicuotaDeTexto` distingue NULL de `"0"`). Todo correcto.
ADR-0082 lo dejó escrito tal cual: _"este ADR no arregla el exento: arregla no
poder ver qué pasa"_ — y agregó que el botón Sincronizar dijera cómo le fue.

En la décima vuelta el botón contestó:

```
error returned from database: (code: 1299)
NOT NULL constraint failed: articulo.alicuota_iva
```

`articulo.alicuota_iva` e `item_venta.alicuota_iva` se crearon `NOT NULL`. El
16/9/2026 el código empezó a escribir NULL para los exentos (ADR-0076) y nadie
tocó el esquema. Y como el volcado del catálogo corre en **una sola
transacción**, el primer artículo exento hacía `ROLLBACK` de todo: no fallaba el
exento, **no entraba nada**. De ahí que se viera como "el catálogo no baja" y no
como "el exento no anda".

Una instalación nueva no tenía el problema —el esquema se generaba con el
código nuevo—, pero `CREATE TABLE IF NOT EXISTS` no toca una tabla que ya
existe. Sólo lo sufría una base instalada de antes, que es exactamente la única
que había en el campo.

## Lo segundo, que salió de lo primero

El catálogo viejo destapó algo peor. Sebastián comparó el original y el
duplicado de la MISMA Factura A:

```
Original (papel)                     Duplicado (desde Comprobantes)
Subtotal neto  $ 9.714,46            Subtotal neto  $ 8.264,46
IVA 0%         $     0,00            IVA 21%        $ 1.735,54
IVA 21%        $ 1.735,54            Exento         $ 1.450,00
```

Los dos son de la misma venta y el mismo CAE. El duplicado está bien; **el
original, que es el que se llevó el cliente, no**.

El POS imprime con su catálogo local y el servidor le declara a ARCA con el
suyo. Mientras coinciden no se nota; acá no coincidían —la terminal no podía
actualizarse— y salió una venta impresa con IVA 0% y declarada como exenta. Dos
documentos distintos del mismo hecho.

## Decisión

### 1. `alicuota_iva` pasa a admitir NULL, y las bases ya instaladas se migran

SQLite no tiene `ALTER COLUMN`: hay que recrear la tabla, copiar las filas y
renombrarla. Vive en `packages/app/src/sqlite/migraciones.ts` y corre en cada
arranque, después de `agregarColumnasNuevas`.

Es **condicional**: primero pregunta por `PRAGMA table_info` y sólo recrea la
tabla que todavía tiene el `NOT NULL`. En una base sana son dos consultas y
nada más, así que se puede correr siempre sin pensarlo.

Recrear `articulo` no es gratis: es padre de `precio_articulo`, `existencia`,
`movimiento_stock`, `lote` y `combo_componente`, y con las claves foráneas
activas el `DROP TABLE` se comporta como un `DELETE FROM` y rebota contra todos
los hijos. Va con `PRAGMA foreign_keys = OFF` —fuera de la transacción, que es
donde el pragma hace efecto—, adentro de una transacción, y termina con
`PRAGMA foreign_key_check`: si quedó una referencia rota preferimos enterarnos
al arrancar y no en la primera venta. Los tests cubren las filas, los hijos, el
índice, que las FK queden encendidas y que correrlo dos veces no haga nada.

**No se arreglan los datos viejos.** Las filas que hoy dicen `"0"` donde
correspondía exento las pisa el primer pull que ahora sí completa.

### 2. A ARCA se le declara la alícuota que se IMPRIMIÓ

El POS manda por cada línea la alícuota con la que salió el renglón —`"EXENTO"`
o el porcentaje en texto— y el servidor desglosa con ésa. El catálogo del
servidor queda como respaldo: para las ventas que no la traen (anteriores al
26/9/2026) y para un valor que no se entienda.

Es al revés de como estaba, y el comentario que había lo decía con todas las
letras: _"la tasa de cada línea sale del producto: es el servidor el que la
sabe, no se le cree al cliente"_. Suena bien y está mal. **El papel que tiene
el cliente en la mano ES el comprobante.** Lo que se declara tiene que ser eso,
no una versión mejor calculada diez segundos después. Si la caja imprimió con
el catálogo viejo, el problema es el catálogo viejo y se arregla en el
catálogo; lo que no se puede es terminar con dos documentos distintos de la
misma venta, porque no hay forma de explicarle a un inspector cuál vale.

Es la misma decisión que ADR-0073 (el desglose viaja congelado) y ADR-0083 (el
neto por línea viaja congelado), un nivel más abajo. No hace falta columna
nueva: el desglose ya se congela al emitir, y los reintentos usan el congelado.

Cuando las dos alícuotas difieren, el servidor deja un `warn` con el producto y
las dos tasas. La próxima divergencia la queremos ver nosotros, no el contador.

### 3. Las preguntas las dibuja la app, no el webview

`window.confirm` dentro de Tauri falló de dos maneras distintas en dos rondas
seguidas, siempre sobre el mismo botón:

- **22/9**: devolvía una promesa. `if (!window.confirm(...))` la daba por
  verdadera y F4 vaciaba la caja **sin preguntar**.
- **26/9**: ya esperando esa promesa, F4 dejó de hacer nada. No aparecía ningún
  cartel. _"Aprieto y no sale nada."_

Dos rondas sobre un botón que borra la venta en curso alcanzan. El diálogo del
webview no lo controlamos, no se puede probar acá y cambia entre versiones de
Tauri y de WebView2: no es algo sobre lo que se pueda construir. Ahora lo
dibuja `componentes/Dialogos.tsx`, montado una vez en la raíz, con Enter y Esc,
y el foco arrancando en **Cancelar** para que un Enter distraído no dispare lo
que se está preguntando.

`preguntarSiNo` / `pedirTexto` siguen siendo la puerta de entrada, así que no
cambió ningún llamador. Sí se pasaron a esa puerta los **diez** `window.confirm`
sueltos que quedaban en los módulos de gestión (desactivar un producto, anular
un comprobante, revocar una credencial, cambiar el entorno de ARCA…): todos
tenían la forma sincrónica, y todos venían ejecutándose **sin preguntar** desde
que la app corre en Tauri.

Los listeners globales de teclado consultan `hayDialogoAbierto()`: mientras hay
una pregunta en pantalla, el Enter y el Escape son de ella.

### 4. Lo que se imprime se saca de la pantalla que lo imprime

El original y el duplicado no salían iguales ni en el A4 ni en el ticket chico,
más allá de los números: encabezados en mayúsculas, otra tipografía, otro
interlineado. La causa es que los templates se renderizaban adentro del
componente que llamaba a imprimir, y los módulos de gestión cuelgan de
`.gestion`, que tiene su propia regla para las tablas:

```css
.gestion th { text-transform: uppercase; letter-spacing: .5px; … }
```

Misma especificidad que `.a4-items th` y más abajo en la hoja de estilos, así
que ganaba. La caja no cuelga de `.gestion`; Comprobantes sí. De ahí que el
original saliera de una forma y su duplicado de otra.

Ahora las tres hojas (`ComprobanteA4`, `ComprobanteTicket`,
`ComprobanteCredencial`) se renderizan con un portal a `<body>` — ver
`HojaImpresa.tsx`. Le llegan sólo sus propias reglas, salga la impresión de
donde salga. Un duplicado tiene que ser el mismo papel, no un parecido.

### 5. Se saca el atajo F12

Lo pidió Sebastián dos rondas seguidas y la segunda vez insistió. El camino
normal —Enter con el buscador vacío— ya abre el asistente con el saldo exacto
propuesto. Un atajo aparte que se comporta distinto según el estado en que se
lo apriete no suma. Se retoma si un comercio lo pide.

## Consecuencias

- El catálogo vuelve a bajar en las terminales instaladas, y con él los
  exentos. Es lo que estaba trabado desde la séptima vuelta.
- La Factura A original y su duplicado vuelven a decir lo mismo.
- Hay que publicar el servidor (sin migración de base esta vez) y el POS. Un
  POS nuevo contra un servidor viejo sigue funcionando: la alícuota que manda
  se ignora y se desglosa como antes.
- Diez confirmaciones de gestión que no preguntaban, ahora preguntan.

## Lo que se hizo mal

El esquema y el código se fueron por caminos separados. ADR-0076 cambió lo que
se escribe sin mirar si la base lo aceptaba, y el test que lo cubría corría
sobre una base **creada de cero**, donde la columna ya salía bien. Ninguna
prueba tocó el caso real: una base vieja que se actualiza.

Y el diagnóstico tardó tres rondas por algo que no era el bug: **el error
existía y nadie lo veía**. `volcarCatalogo` lanzaba, el botón se lo tragaba, y
desde afuera "falló" y "no pasó nada" se ven igual. Recién cuando ADR-0082 hizo
hablar al botón, el problema se resolvió en una línea. La lección no es sobre
el `NOT NULL`: es que un error que no se muestra cuesta más que el error.

---

## Apéndice — 29/9/2026: la Factura A de puros exentos

Verificado en campo: el catálogo bajó ("Catálogo al día, 27 productos"), el
exento entró, y la Factura A con un producto exento y uno gravado salió bien y
**idéntica a su duplicado**. Lo que apareció al probarlo fue otro caso, y es el
mismo error de razonamiento por tercera vez.

Una Factura A de **sólo** productos exentos salía así:

```
Precios sin IVA
Arroz Blanco Largo Fino 1kg
1 x $ 1.450,00        $ 1.450,00
--------------------------------
TOTAL          $ 1.450,00
```

Sin "Subtotal neto" y sin el renglón "Exento". El que la recibe no tiene cómo
saber que la operación era exenta: lee un comprobante A sin IVA discriminado y
sin explicación.

La causa es `subtotalNeto()`, que filtraba los renglones gravados y devolvía
`null` cuando no quedaba ninguno. Los tres renderers gobiernan **todo** el
bloque de totales con ese `null` —el subtotal y los renglones del desglose—,
así que desaparecía entero.

`null` estaba significando dos cosas distintas: *"este comprobante no
discrimina"* (una B, o una A vieja sin desglose guardado) y *"no hay nada
gravado"*. La segunda no es ausencia de dato: **es cero**. Ahora `subtotalNeto`
devuelve `null` sólo cuando no hay desglose, y cero cuando lo hay y todo es
exento.

Es la tercera vez con la misma confusión: la B de puros exentos perdía el
bloque de Transparencia Fiscal (apéndice de ADR-0079), el exento no aparecía en
el duplicado (ADR-0083), y ahora esto. **Y el test lo fijaba al revés** — yo
mismo escribí `expect(subtotalNeto(...)).toBeNull()` para este caso. Un test
que documenta el error no protege de nada; lo hace durar.

La pregunta que faltó las tres veces es la misma: *¿corresponde mostrarlo?*, no
*¿hay algo que sumar?*

También de esta ronda: al cancelar una pregunta, el foco no volvía al buscador
y la caja quedaba sin recibir el teclado. Lo devuelve `Dialogos.tsx` —que anota
dónde estaba antes de preguntar— **antes** de resolver la promesa, para que el
que preguntó pueda mandarlo a otro lado y gane su decisión. La caja lo manda
siempre al buscador, incluso cuando se preguntó desde el botón.
