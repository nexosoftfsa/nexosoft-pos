# ADR-0081 — Los pagos son de la venta que los cargó

Fecha: 2026-09-21
Estado: aceptado

## Contexto

El asistente de cobro se cerraba con Esc **dejando los pagos cargados**, a
propósito: la idea era poder retomar el cobro donde se había dejado. El
comentario lo decía con todas las letras — *"Cierra el asistente sin tocar los
pagos ya agregados"*.

En la prueba del 18/9/2026 Sebastián encontró a dónde lleva eso:

> "Eliminé el producto del carrito y cargué otro y le di el primer Enter y me
> salió directamente al cartel de *cobro completo* pero esta vez con un vuelto.
> Se quedó pegado los importes que cargué anteriormente."

Un producto de $ 1.600 con los $ 1.650 de la venta anterior todavía cargados:
"Cobro completo", vuelto $ 50. **Una venta a punto de emitirse con la plata de
otra**, a un Enter de distancia.

Y había un segundo problema que lo empeoraba: desde el resumen no se podía
volver atrás. Esc cerraba el asistente pero dejaba los pagos, así que el
siguiente Enter volvía a abrirlo directamente en el resumen —porque el cobro ya
estaba cubierto— y el cajero quedaba encerrado. Sus palabras:

> "Si el cajero se confundió de medio de pago no puede volver atrás con las
> teclas para corregir. Debo vaciar el carrito para comenzar una venta de nuevo
> con todos los pasos (si son más de 15 productos el cajero debe escanear todos
> nuevamente y la gente de la fila se va a otro comercio)."

## Decisión

### Si cambia el carrito, los pagos se descartan

Un pago se cargó contra un total. Cambiado el total, ese pago ya no dice nada:
mantenerlo es conservar un número que parece válido y no lo es.

`descartarPagosDeOtraVenta()` corre en los cuatro caminos que tocan el carrito
—agregar, cambiar cantidad, fijar cantidad, quitar—. No hay ningún flujo real
que pierda algo: los pagos se cargan al final, cuando el carrito ya está
cerrado.

### Esc en el resumen deshace el último pago y vuelve a elegir medio

Es lo que "volver atrás" significa en un asistente, y es lo que faltaba. Antes
cerraba, que no es volver atrás: es salir por una puerta que te deja igual que
estabas y sin forma de corregir.

Con un pago mixto deshace de a uno, y con la lista vacía sí cierra.

### F4 cancela la venta entera

No había ninguna salida. Abandonar una venta —al cliente le rebotó la tarjeta,
se arrepintió— era sacar los productos de a uno. Ahora hay un atajo y un botón
discreto al lado de "Confirmar venta", con confirmación: con quince productos
cargados, un F4 sin querer cuesta escanearlos todos otra vez.

### El paso "resumen" deja de parecer el final

Tenía un tilde verde de 52px y el título "Cobro completo". Lo único que decía
que faltaba un Enter era una línea gris al pie. Sebastián:

> "No hay nada que obligue al cajero a confirmar la venta."

Tiene razón, y es peligroso en las dos direcciones: el cajero cree que terminó
y se va, o duda y aprieta de más. Ahora el tilde no está, "Cobro completo" es
un subtítulo gris que habla de **la plata**, y lo que resalta es un botón con
`Enter — para confirmar la venta`, con el aviso de que el comprobante todavía
no se emitió.

## Consecuencias

- No se puede pre-cargar un pago y después seguir cargando productos. Nunca fue
  un flujo real y ahora es imposible.
- El cajero puede corregirse sin perder el carrito.
- Hay una forma de abandonar una venta que no es vaciar el carrito a mano.

## Lo que se hizo mal

"Cierra el asistente sin tocar los pagos ya agregados" fue una decisión
deliberada, con su comentario explicándola, y estuvo mal. La intención era
buena —no perder trabajo— pero nadie se preguntó qué pasa si entre el cierre y
la reapertura **cambia aquello que los pagos estaban pagando**.

Es el mismo error que ADR-0077 por otro lado: guardar un estado que sólo tiene
sentido junto a otro, y no atarlo a ese otro.
