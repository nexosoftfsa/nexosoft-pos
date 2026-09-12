# ADR-0075 — El polling del cobro apaga su propio intervalo

Fecha: 2026-09-11
Estado: aceptado

## Contexto

En la prueba del 11/9/2026 el sistema emitió **cientos de comprobantes fiscales
en dos minutos**. Facturas B 0002-00005881 a 0002-00005921 y siguientes, todas
por $500, todas del mismo producto, todas con CAE de ARCA.

Sebastián lo describió así:

> Es como que se tildó y empezó a replicar las ventas (con nro de facturas
> distintos) del mismo producto, esta vez **el sistema como ametralladora**.
> Cientos de ventas. Mis intentos de imprimir y salir fueron 5 o 6 veces, no
> cientos. La única forma de parar fue salir del sistema y volver a entrar.

Es lo más grave que apareció en todo el proyecto. En un comercio real serían
cientos de facturas verdaderas ante ARCA, con su IVA, que después hay que anular
una por una.

### Cómo se llega

Se dispara cobrando con Billetera (QR) y apretando Enter sobre el cartel
"Esperando confirmación en el dispositivo…". No hay que hacer nada raro: el
cartel aparece solo y el Enter es la tecla con la que se opera todo el POS.

Hay **tres** defectos encadenados, y cualquiera de los tres, solo, habría
evitado el desastre.

**1. `clearInterval` apagaba el intervalo vigente, no el propio.**

```js
pollingRef.current = setInterval(async () => {
  if (estado.estado === "aprobado") {
    clearInterval(pollingRef.current!);   // ← el vigente, no el mío
```

Mientras no haya más de un cobro, `pollingRef.current` es el propio y funciona.
Con dos, una corrida vieja apaga a la nueva y **se queda viva ella**.

**2. Un Enter durante la espera arrancaba un cobro nuevo.**

`confirmar()` sólo verificaba que el carrito no estuviera vacío. Con el pago
electrónico en curso, cada Enter llamaba de nuevo a `pasarela.iniciarPago` y
pisaba `pollingRef.current` con un intervalo nuevo — que es justo lo que activa
el defecto 1.

**3. El polling entra a `_finalizarVenta` salteando el chequeo del carrito.**

`if (carrito.length === 0) return` estaba en `confirmar()`, y el polling llama a
`_finalizarVenta` directo. Peor: el closure del intervalo tiene el **carrito
viejo**, así que aunque la pantalla estuviera limpia, cada corrida emitía la
misma venta otra vez. Por eso todas las réplicas son del mismo producto y por el
mismo importe.

El resultado: varios intervalos huérfanos, cada uno emitiendo una venta cada dos
segundos, para siempre. La guarda de reentrada de ADR-0074 no lo cubre: entre
corrida y corrida pasan dos segundos y ya se soltó.

## Decisión

### Cada corrida apaga su propio intervalo

```js
const id = setInterval(..., 2000);
pollingRef.current = id;

function detenerPolling(id) {
  clearInterval(id);
  if (pollingRef.current === id) pollingRef.current = null;
}
```

### Un intervalo que ya no es el vigente se apaga solo

Primera línea de la corrida: si `pollingRef.current !== id`, es un huérfano,
`clearInterval(id)` y afuera. Es la red que atrapa cualquier otro camino que
deje uno suelto, incluidos los que todavía no escribimos.

### Un cobro electrónico en curso bloquea otro

`confirmar()` corta si `pollingRef.current !== null`. Se mira el `ref` y no el
estado `pagoElectronico` porque esto se llama desde el listener global de
teclado, cuyo closure puede tener el estado del render anterior — la misma
lección de ADR-0073 y ADR-0074, tercera vez.

### El polling se rinde a los dos minutos

60 intentos de 2 segundos. Un cobro que no se confirmó en dos minutos no se va a
confirmar, y un bucle sin final es exactamente lo que pasó acá.

### `_finalizarVenta` verifica el carrito

Última red antes de emitir: el camino del pago electrónico entra ahí directo.

### Salir de la pantalla apaga el polling

Un `useEffect` de limpieza. Sin eso el intervalo sigue corriendo contra un
componente desmontado, emitiendo ventas que ya nadie pidió.

## Consecuencias

- Un Enter de más sobre el cartel de espera no hace nada.
- Un cobro electrónico que se cuelga termina con un mensaje que dice qué
  revisar, en vez de quedar girando.
- Los comprobantes que ya se emitieron en la prueba están en homologación y no
  tienen consecuencia fiscal. En producción habría que anularlos uno por uno.

### El servidor también frena

El servidor aceptó los cientos de comprobantes sin chistar, y con razón: cada
uno traía su propio `operacionId`, así que la idempotencia —que existe y
funciona— no tenía nada que deduplicar. Eran ventas distintas para todo efecto.

Se agregó un freno por **ritmo** (`rafaga-de-ventas.ts`): más de 30 ventas de la
misma terminal en un minuto se rechazan con un mensaje que dice qué pasó y que
lo ya emitido está bien.

Por ritmo y no por contenido a propósito: un kiosco vende diez veces el mismo
cigarrillo en un minuto y eso es normal. Lo que ninguna caja real hace es
cerrar treinta ventas en un minuto — hay un cliente adelante, hay que cobrar,
dar vuelto y entregar.

Y **no rompe el modo offline**, que era el riesgo real de poner un tope: una
terminal que vuelve de estar sin servidor sube su cola de golpe, y pueden ser
cincuenta ventas en dos segundos. Se distinguen por la *fecha de la venta*, no
por cuándo llegan: sólo cuentan para el tope las que ocurrieron recién, que son
las únicas que un bucle puede producir.

Esto no reemplaza al arreglo del POS. Es la red de abajo, para el próximo
camino que se desboque.

## Lo que este arreglo NO cubre

No hay tests de la carrera en el POS, por lo mismo de siempre: pide un test de
componente que no tenemos montado. La defensa ahí es estructural y de campo. El
freno del servidor sí está cubierto, incluido el caso de la cola offline.

## Lo que se hizo mal

`clearInterval(pollingRef.current!)` tiene un `!` que dice, literalmente, "acá
seguro que hay algo". La pregunta que no se hizo es **si ese algo era el mío**.

El patrón correcto —guardarse el id y apagar ese— es el que enseña cualquier
manual de `setInterval`. Se escribió el atajo porque con un solo cobro a la vez
funciona igual, y "un solo cobro a la vez" era una suposición que nada en el
código sostenía.

Tercera vez en tres ADRs que el problema es leer estado compartido desde un
closure viejo. La regla, ahora explícita: **en esta pantalla, todo lo que
coordine trabajo asincrónico va en un `ref`, y todo lo que se cancele se cancela
por su propio identificador.**
