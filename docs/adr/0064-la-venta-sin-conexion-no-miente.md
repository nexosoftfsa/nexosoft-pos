# ADR-0064 — La venta sin conexión no miente

Fecha: 2026-09-02
Estado: aceptado

## Contexto

Primera prueba real vendiendo con **internet desconectado**, en la PC de
Sebastián. Era lo único del sistema que nunca se había verificado, y lo que más
podía doler: si vender sin red falla, un corte nuestro deja sin facturar a todos
los comercios a la vez.

Vender anduvo. El stock se descontó (es local, `servicio-venta.ts`). Pero el
ticket salió así:

```
        Factura C
     N° 0002-00000033
     Pendiente de autorizacion en ARCA
```

Y al reconectar, el comprobante que quedó registrado fue el **0002-00000004**.

Tres problemas, uno detrás de otro:

1. **El número impreso no era el fiscal.** Sin red no hay forma de saber el
   número: lo asigna ARCA. El POS imprimía su correlativo local (33) con el
   formato de un número fiscal. El cliente se llevó un papel que no coincide con
   ningún comprobante existente.
2. **La venta se fechaba al llegar, no al ocurrir.** `Venta.creadaEn` era
   `@default(now())` en el servidor y el payload no mandaba ninguna fecha. Eso
   explicaba el síntoma que sí se notó —"no sumó a la caja"— y dos que no:
   los reportes ponían la venta en el día equivocado, y el `CbteFch` que veía
   ARCA no era el del ticket. Peor: `ventana-de-fecha.ts`, que existe para
   detectar ventas demasiado viejas para autorizar, **nunca podía dispararse**,
   porque para él toda venta era de hoy.
3. **Comprobantes quedaba vacío.** La pantalla lee del servidor (ADR-0028). Sin
   red el cajero no podía ni reimprimir el ticket que acababa de emitir.

## Decisión

### 1. La fecha de la venta viaja con la venta

`CrearVentaDto` gana `fecha` (ISO 8601), el POS manda la fecha que **ya salió
impresa en el ticket**, y el servidor la usa como `creadaEn` y como `CbteFch`.

Es un dato del cliente y un reloj de PC de comercio puede estar cualquier cosa,
así que `fecha-de-venta.ts` la acota: más de 10 minutos adelantada o más de un
mes vieja se descarta y se usa la hora del servidor. Sin fecha (POS viejo)
también: retrocompatible.

Como efecto secundario, la ventana de ARCA ahora **funciona de verdad**: una
venta que estuvo offline más de 5 días se registra `PENDIENTE` con el motivo
explicado, en vez de mandarse y comerse el rechazo.

### 2. Un comprobante sin CAE no muestra número fiscal

`numeroEsProvisional()` es la regla, y vale para los tres formatos (ticket, A4 y
térmica): **un comprobante fiscal sin CAE todavía no tiene número fiscal.** En
vez del `N° 0002-00000033` se imprime `Referencia interna 00000033`, y el pie
aclara que el número y el CAE los asigna ARCA al autorizar.

La regla es más general que el caso offline: una venta que el servidor dejó
`PENDIENTE` porque ARCA no contestó también lleva un correlativo provisional que
cambia al autorizarse.

Se descartó **adivinar el número fiscal offline**: dos terminales sin red
elegirían el mismo y chocarían. Sin red no se puede saber; lo que sí se puede es
no inventarlo.

### 3. Comprobantes se cae a la copia local

Si el servidor no contesta, la pantalla muestra las ventas guardadas en la
terminal, con un cartel que dice de dónde salen y qué les puede faltar. Se puede
ver y reimprimir; **Anular y Verificar en ARCA se esconden**, porque necesitan
servidor.

Para que esa copia no mienta, la terminal aprende lo que resolvió el servidor:
`vincularOperacion()` deja anotado con qué operación de la cola viaja cada
venta, y `volcar-comprobantes.ts` le escribe el número de ARCA y el CAE cuando
la sincronización los trae. Sin eso, una venta autorizada hace rato seguiría
mostrándose como pendiente.

El número de ARCA va a una columna nueva, `numero_fiscal`, y **nunca pisa
`numero`**: son dos series distintas sobre la misma tabla, y `numero` tiene un
`UNIQUE (punto_de_venta, tipo, numero)` que se rompería —el correlativo local va
muy por delante del fiscal, así que el número de ARCA casi siempre ya está
ocupado por una venta vieja de la terminal.

## Consecuencias

- El papel que se lleva el cliente nunca afirma un número que después va a
  cambiar. A cambio, un ticket offline sale sin número fiscal: es la verdad, y
  el comprobante definitivo se reimprime cuando vuelve la conexión.
- La caja, los reportes y ARCA ven la fecha real de la venta. Un arqueo hecho
  después de sincronizar cierra.
- Una venta offline de más de 5 días queda marcada para regularizar con el
  contador, en vez de fallar en silencio.
- La terminal tiene una copia utilizable de sus comprobantes. No reemplaza al
  servidor: no ve lo que vendieron otras cajas.

## Lo que queda pendiente

El cierre de caja **hecho durante el corte** sigue dando un saldo teórico
incompleto: las ventas que todavía no subieron no están en el servidor, que es
quien calcula el resumen. Con la fecha arreglada, reabrir el turno después de
sincronizar da el número correcto — pero el arqueo ya firmado no se recalcula
solo. Hay que decidir si se recalcula o si se avisa antes de cerrar con
operaciones pendientes en la cola.
