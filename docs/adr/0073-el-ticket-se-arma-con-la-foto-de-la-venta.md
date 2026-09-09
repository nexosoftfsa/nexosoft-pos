# ADR-0073 — El ticket se arma con la foto de la venta, no con la pantalla

Fecha: 2026-09-09
Estado: aceptado

## Contexto

En la prueba del 8/9/2026 se emitieron cuatro Facturas A iguales y **ninguna
salió completa**. Sebastián encontró el patrón solo, y lo describió mejor de lo
que lo habríamos descrito nosotros:

> 1. Si el cajero se toma su tiempo para cobrar, el cliente se lleva una factura
>    A casi perfecta ya que no tiene los datos del receptor.
> 2. Si el cajero cobra apurado (Enter a lo loco), que es el caso normal de un
>    comercio con muchos clientes (**no es culpa del cajero**), el cliente se
>    lleva un ticket a medias, con los datos del receptor pero sin QR ni CAE.

| | Nº fiscal, CAE, QR | Datos del receptor |
|---|---|---|
| Cajero tranquilo (`0002-00000007`, `0002-00000009`) | **sí** | no |
| Cajero apurado (`Ref. interna 9`, `Ref. interna 11`) | no | **sí** |
| Reimpresión desde Comprobantes | sí | sí |

El IVA discriminado salía bien en los cuatro, y la reimpresión salía perfecta.

### Una sola causa

`imprimirTicket` leía dos cosas del **estado de la pantalla**: el cliente
(`clienteId`) y la respuesta del servidor (`comprobanteServidor`). Y la venta,
apenas confirma, limpia el cliente y los pagos para dejar la caja lista para el
próximo. O sea que el ticket leía datos que la venta ya había borrado.

Encima, la impresión se dispara desde un listener global de teclado. Su closure
queda con los valores del render en que se registró, y `comprobanteServidor` no
estaba entre sus dependencias. De ahí las dos mitades:

- **Enter rápido**: el listener todavía era el viejo. Veía el `clienteId`
  cargado (receptor sí) y `comprobanteServidor` en `null` (CAE no).
- **Enter tranquilo**: al vaciarse `clienteId` —que sí era dependencia— el
  efecto se volvió a registrar. El listener nuevo veía `comprobanteServidor`
  resuelto (CAE sí) y el `clienteId` ya vacío (receptor no).

No era una carrera con ARCA. Era una carrera **con el tecleo del cajero**, que
es la peor clase de carrera: no se puede reproducir a voluntad y le echa la
culpa al que la encuentra.

El mismo defecto tenía el botón "Imprimir A4" del panel de post-venta, por la
misma razón. Nadie lo había notado.

## Decisión

### El ticket se arma con una foto tomada al confirmar

Al confirmar la venta, y **antes** de que la pantalla limpie nada, se guarda en
un `ref` lo que el ticket va a necesitar: el cliente, los pagos y la espera del
comprobante del servidor.

Va en un `ref` y no en estado a propósito: un `ref` no puede quedar viejo en el
closure de un listener. El patrón ya existía en la pantalla —`ventaAsistente`
guarda los pagos por exactamente este motivo, y `pasoAsistenteRef` es un espejo
para el mismo problema de closures— sólo que a medias.

### La impresión espera la misma promesa que espera la venta

`encolarYEsperarComprobante` ya se esperaba, con su tope de 5 segundos
(ADR-0061), antes de vaciar el carrito. Ahora la impresión **se engancha a esa
misma promesa** en vez de mirar el estado.

No agrega ni un segundo de espera: el cajero ya estaba esperando eso mismo para
que se le limpiara la caja. Lo único que cambia es que ahora el papel también
espera, así que sale igual sea el cajero rápido o lento.

Si la espera vence o falla, el ticket sale con lo local diciendo "El número de
comprobante y el CAE los asigna ARCA al autorizar" — que es correcto, y es lo
que debe pasar sin conexión (ADR-0064, ADR-0068).

## Consecuencias

- El ticket que se lleva el cliente deja de depender de la velocidad de tipeo.
- El A4 de post-venta también sale con el receptor.
- `construirDatosTicket` se exporta para poder fijar su contrato en tests: el
  número fiscal y el receptor son independientes y el ticket lleva los dos
  cuando los dos están.

## Lo que este arreglo NO cubre

**La carrera en sí no está cubierta por tests.** Los cuatro tests nuevos fijan
el contrato de `construirDatosTicket`, pero esa función siempre hizo lo
correcto con lo que recibía: el defecto estaba en qué se le pasaba. Cubrirlo de
verdad pide un test de componente que no tenemos montado.

La defensa real es estructural —una foto en un `ref`, y una sola promesa
esperada por los dos caminos— más la prueba de campo. Queda dicho para que
nadie lea "hay tests" y suponga que este escenario está atado.

## Lo que se hizo mal

La pantalla de venta acumula estado que se limpia al confirmar, y la impresión
ocurre después de esa limpieza. Eso ya se sabía: el comentario de
`ventaAsistente` dice, textualmente, que guarda los pagos *"porque `pagos` se
limpia al confirmar y el ticket los necesita"*.

Se detectó el problema, se resolvió para los pagos, y no se preguntó qué más
necesitaba el ticket. La regla que faltaba: **si algo se limpia al confirmar y
el ticket lo usa, va en la foto — todo, no el caso que apareció.**
