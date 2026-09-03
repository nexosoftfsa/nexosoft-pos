# ADR-0066 — Sin internet no es lo mismo que sin servidor

Fecha: 2026-09-02
Estado: aceptado

## Contexto

Sebastián repitió la prueba sin internet con POS 0.1.53 / Servidor 0.14.0. Todo
lo que se había arreglado andaba:

- el ticket sin conexión salió con `Referencia interna 00000034` y la leyenda,
  sin inventar número fiscal;
- al reconectar, la venta quedó como `Factura C 0002-00000005` con CAE
  `86351178060649` y QR;
- **la fecha se conservó**: la venta se hizo 19:46 y sincronizó 20:03, y quedó
  registrada a las 19:46. Era lo que había que probar;
- la caja sumó los $100 y el saldo teórico cerró.

Pero el paso 4 falló, y su explicación destapó algo peor:

> *"Sin reconectar, andá a Comprobantes. → **La venta NO aparece.** No hay
> cartel de sin conexión."*

La pantalla **sí** cargó y mostró los comprobantes viejos. O sea `historial()`
no falló: el servidor contestó perfectamente. **Porque el servidor está en la
misma PC.**

Ahí está el error de fondo: el POS usaba `navigator.onLine` para decidir si
sincronizar. Esa propiedad responde *"¿hay internet?"*, y el POS necesitaba
responder *"¿llego a mi servidor?"*. **Son preguntas distintas**: el servidor de
sucursal vive en la LAN, muchas veces en la misma máquina, y un corte de
internet no lo toca.

Consecuencia: con internet caído el POS dejaba de subir ventas **a un servidor
que estaba ahí, listo**. La venta no aparecía en Comprobantes ni sumaba a la
caja hasta que volviera internet, sin ninguna razón técnica. Todo el trabajo de
ADR-0064 y ADR-0065 —la fecha real, la copia local, el aviso del arqueo— seguía
siendo correcto pero se apoyaba sobre una decisión equivocada tomada antes.

Sebastián lo describió sin ver el código:

> *"Si hay un período grande sin conexión y el cajero necesita cerrar la caja le
> va a sobrar dinero y no tiene cómo cotejarlo hasta que vuelva el internet. Lo
> mismo si quiere controlar una venta o atender un reclamo."*

## Decisión

**`navigator.onLine` no se usa más para decidir nada.** Se intenta sincronizar
siempre; si el servidor no está, el intento falla solo y la operación queda en
la cola.

El estado que ve el cajero pasa a significar **"llego a mi servidor"**, y se
deduce del intento, no del navegador (`llego-al-servidor.ts`): *llegamos si
alguna operación del lote quedó resuelta*. Una aceptada, o una rechazada de
forma definitiva, sólo puede venir de una respuesta. Si todas quedaron
reintentables, no hubo nadie del otro lado — es exactamente lo que hace
`MotorDeSincronizacion` ante un fallo de transporte, que no lanza.

Con la cola vacía no se aprende nada y no se toca el estado: "Sincronizado" es
la verdad aunque el servidor esté caído, porque no hay nada esperando.

El evento `online` del navegador se sigue escuchando, pero sólo como **buen
momento para reintentar**. El evento `offline` se dejó de escuchar: perder
internet no implica perder el servidor.

### Por qué no da miedo sacar el atajo

Antes, con `navigator.onLine === false` se salía sin intentar y el ticket salía
al instante. Ahora se intenta siempre, con el tope de espera de ADR-0061. El
tope existe justamente para esto:

- servidor apagado en la misma PC → la conexión se rechaza al toque;
- servidor en otra PC apagada → no contesta, y corta el tope;
- servidor vivo con ARCA caída → contesta enseguida que quedó pendiente.

## Dos cosas más que salieron de la misma prueba

- **El ticket no decía AM ni PM.** En una PC configurada en 12 horas,
  `toLocaleString` imprimía "07:46" a secas: una venta de la mañana y una de la
  tarde salían iguales. Ahora los tres formatos usan `fechaHoraTicket`, en 24
  horas, que es lo que la térmica ya hacía.
- **El ticket se fechaba al imprimir, no al vender.** Se veía en los PDF: el
  ticket decía `07:46:37` y el comprobante `07:46:35`, los segundos que tardó en
  imprimir. Dos segundos no molestan; en el borde de un día son dos fechas
  distintas. Ahora usa la fecha de la venta.

## Consecuencias

- Un corte de internet deja de afectar lo que no depende de internet: la venta
  sube al servidor de la sucursal, aparece en Comprobantes y suma a la caja al
  instante. Lo único que espera a que vuelva internet es el CAE, que es lo único
  que de verdad lo necesita.
- El indicador de la barra pasa a decir algo útil: "Sin conexión" ahora
  significa *hay ventas sin subir y no puedo subirlas*, no *no hay internet*.
- El respaldo local de Comprobantes (ADR-0064) queda para lo que de verdad es:
  el servidor apagado o inalcanzable, no un corte de internet.
- Con el servidor en otra PC apagada, la primera venta puede esperar el tope
  antes de imprimir. Es el precio de intentar siempre, y es el comportamiento
  correcto.
