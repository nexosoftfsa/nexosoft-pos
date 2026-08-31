# ADR-0061 — El ticket del cliente espera el CAE (con un tope)

- **Estado:** aceptado
- **Fecha:** 2026-08-31
- **Ajusta a:** [ADR-0058](0058-cae-real-contra-arca.md)

## Contexto

La primera prueba en producción destapó algo que no era un bug puntual sino el
diseño del flujo de venta: **el ticket que se lleva el cliente nunca podía tener
el CAE ni el QR.**

El POS confirma la venta contra su SQLite local (`ServicioDeVenta`), que le
asigna un número de su propia numeración y la marca `PendienteCae`. Recién
después encola la operación, y es el servidor el que habla con ARCA. El POS
nunca se enteraba de lo que ARCA había contestado.

Consecuencia visible en la prueba: el mismo comprobante tenía **tres números
distintos**.

| Dónde | Número | De dónde salía |
|---|---|---|
| Ticket impreso | 0002-00000031 | contador local del POS |
| Comprobantes / reimpresión | 0002-00000103 | contador local del servidor |
| ARCA | el que asignara | no se guardaba (corregido aparte) |

Y el ticket decía "Pendiente de autorización de ARCA" **siempre**, aun con ARCA
respondiendo bien. Los QR y CAE que se vieron funcionar durante las pruebas
salieron todos de "Reimprimir", que sí lee del servidor.

Un comprobante electrónico sin CAE ni QR está mal emitido. Así no se podía
ofrecer el sistema.

## Decisión

### La venta fiscal espera el CAE antes de imprimir, hasta 8 segundos

Al confirmar una venta **fiscal**, el POS encola la operación y espera a que el
servidor conteste. Si contesta a tiempo, el ticket sale con el CAE, el QR y **el
número que asignó ARCA**. El resultado del comprobante viaja de vuelta con la
respuesta del sync (`ComprobanteResuelto`), sin una segunda llamada.

8 segundos es un compromiso deliberado: el servidor corta su llamada a ARCA a
los 20, así que esperar más no aportaría; y con un cliente adelante del
mostrador, más que eso es demasiado.

### Agotar la espera NO cancela nada

Si el servidor no contesta a tiempo, se deja de esperar pero **la operación
sigue su curso en la cola**. El ticket sale como antes —"pendiente"— y el CAE se
consigue después. Ésa es la garantía de ADR-0058 y no se toca: la venta nunca
depende de que ARCA esté disponible.

Lo único que se acota es cuánto espera la caja, no si la venta se sincroniza.
Por eso `esperarConTope` está separado y testeado: la diferencia entre "dejar de
esperar" y "cancelar" es lo único que hace que este cambio sea seguro.

### Un ticket no fiscal no espera nada

Si el comprobante es `TicketNoFiscal`, se imprime al instante y no se toca ARCA.
Es el comercio el que decide si una venta lleva comprobante fiscal —muchas no
tienen datos del cliente y salen como ticket común—, y esa decisión no puede
costarle un segundo de demora a la caja.

### El servidor manda sobre el número y el CAE

Cuando el servidor contesta, sus datos **pisan** a los locales al armar el
ticket. La numeración local del POS pasa a ser lo que siempre debió ser: un
provisorio para poder vender sin red, no el número del comprobante.

## Consecuencias

- Con ARCA funcionando, el cliente se lleva un comprobante completo y correcto.
- Sin ARCA, todo se comporta como antes: se vende, se imprime, y el CAE llega
  después.
- La caja puede demorar hasta 8 segundos en imprimir una venta fiscal. Es el
  precio de emitir bien, y sólo se paga cuando ARCA está lenta.
- Queda una divergencia conocida: el registro **local** del POS conserva su
  número provisorio aunque el ticket salga con el de ARCA. No afecta al
  comprobante ni a los reportes (que leen del servidor), pero conviene
  resolverlo cuando se toque la numeración local.
- No cambia nada para un comercio que factura con ticket no fiscal.
