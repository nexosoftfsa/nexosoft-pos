# ADR-0074 — Un Enter, una venta

Fecha: 2026-09-10
Estado: aceptado

## Contexto

En la prueba del 9/9/2026, Sebastián tecleó Enter "como ametralladora" para
forzar el caso extremo. Resultado:

> Me generó dos ticket, es decir dos ventas del mismo producto. Noté que la
> pantalla se quedó generando el comprobante (normal) y al presionar "Enter"
> ahí se volvió a re-confirmar la venta y el sistema lo tomó como una venta
> diferente. Total dos ticket en un segundo prácticamente.

Fue a Comprobantes y estaban las dos, **cada una con su CAE**. Dos comprobantes
fiscales, dos CAE, por una sola venta real.

Confirmar tarda: se espera al servidor y a ARCA, hasta 5 segundos (ADR-0061).
Nada cortaba la reentrada en esa ventana. `confirmar()` verificaba que el
carrito no estuviera vacío, y el carrito recién se vacía al final — así que
cada Enter que llegaba mientras tanto arrancaba una venta nueva.

Su conclusión, que compartimos:

> Nunca un cajero va a dar "Enter" como ametralladora, pero estaría bueno que se
> bloquee el botón unos segundos.

Es más grave de lo que suena. Un lector de código de barras que repite, un
teclado que rebota, una PC trabada un segundo: cualquiera de esas produce lo
mismo, y el que lo paga es el comercio, con dos facturas emitidas ante ARCA y un
cliente que compró una vez.

## Decisión

Un `ref` de reentrada alrededor de la confirmación: mientras hay una venta
confirmándose, otra no arranca.

Va en un `ref` y no en estado por lo mismo que la foto de impresión de
ADR-0073: el Enter entra por un listener global de teclado cuyo closure puede
tener el valor del render anterior. Un estado recién actualizado ahí todavía se
lee viejo — que es exactamente el agujero por el que se cuela el segundo Enter.

Además, los botones "Cobrar (Enter)" y "Confirmar venta" quedan apagados cuando
la venta no se puede facturar. Lo pidió Sebastián con estas palabras:

> si querés, podés apagar el botón de "Cobrar (Enter)" para que el cajero no
> piense que se congeló la pantalla

Tenía razón: el asistente no abría (ADR-0073) pero el botón seguía encendido, y
un control que se puede tocar y no hace nada parece la pantalla colgada.

## Consecuencias

- Un Enter de más no emite un comprobante de más.
- El ticket "Ref. interna 14" que apareció en esa corrida era la segunda venta
  espuria imprimiendo antes que la primera. Con esto no vuelve a existir.

## Lo que este arreglo NO cubre

**La reentrada no está cubierta por tests.** Igual que en ADR-0073, reproducir
la carrera pide un test de componente que no tenemos montado. La defensa es
estructural —un `ref` que no puede leerse viejo— más la prueba de campo.

Tampoco cubre el otro lado: dos ventas idénticas a propósito, en dos momentos
distintos, son dos ventas legítimas y así tienen que seguir siendo. Lo que se
corta es la reentrada *durante* una confirmación en curso, no el duplicado.

## Lo que se hizo mal

`imprimirTicket` tenía su guarda de reentrada (`if (imprimiendo) return`) desde
hacía meses. Confirmar la venta —que es lo caro, lo lento y lo que tiene
consecuencias fiscales— no la tenía.

Se protegió lo barato y quedó abierto lo caro, y nadie lo notó hasta que alguien
tecleó más rápido de lo que un test iba a teclear nunca.
