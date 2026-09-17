# ADR-0077 — El candado de la venta cubre el ciclo entero

Fecha: 2026-09-17
Estado: aceptado

## Contexto

Cuarto incidente de campo con la misma forma: un Enter de más, mientras la venta
anterior todavía está terminando, produce una venta de más.

El 17/9/2026, cobrando con Billetera QR y tecleando Enter rápido, salieron **dos
Facturas B con CAE por un solo cobro**. Dos veces seguidas, con el mismo
importe, con segundos de diferencia. Sebastián lo describió bien:

> "Entiendo que al confirmar la venta, el sistema no limpia el carrito y este
> sigue apareciendo unos segundos y es afectado por el siguiente Enter mientras
> el sistema se prepara para imprimir el comprobante original de la primer
> venta."

### Por qué pasaban los controles que ya existían

Había dos guardas, cada una puesta después de su propio incidente:

- `pollingRef` — hay un cobro electrónico esperando al dispositivo (ADR-0075).
- `confirmandoRef` — hay una venta registrándose (ADR-0074).

Entre las dos quedaba un hueco, y el hueco es justo el momento más largo:

```
cobro QR aprobado
  → detenerPolling()         ← pollingRef vuelve a null
  → _finalizarVenta()        ← hasta 8 segundos esperando a ARCA
      → carrito limpio       ← recién acá
```

En esa ventana no hay polling vigente, y `confirmar()` **no miraba**
`confirmandoRef`: sólo lo miraba `_finalizarVenta`, más adentro. Así que un
Enter entraba por la puerta grande, veía el carrito todavía lleno y arrancaba un
cobro QR nuevo. Que también se aprobaba. Y que también terminaba en una venta
real, con su CAE.

Cada guarda tapaba su agujero. Ninguna decía la regla entera.

## Decisión

### Un candado por venta, no por etapa

`ventaEnCursoRef` se pone al arrancar el cobro y se suelta cuando la venta quedó
registrada y la pantalla limpia. Cubre lo que las otras dos cubrían por partes,
incluido el hueco del medio.

Se suelta en un `finally`, y también en cada salida del cobro electrónico
—rechazo, cancelación, tope de dos minutos, error al iniciar—. **Es la parte
peligrosa**: un candado que no se suelta deja la caja muda, que es peor que el
problema que viene a resolver. Por eso no depende de que la venta salga bien.

### La regla vive afuera del componente, y tiene prueba

`componentes/venta-en-curso.ts`: `puedeArrancarVenta` y `puedeAbrirAsistente`,
con los tres estados que importan y un test por cada incidente que los originó.

No es cosmético. Las carreras no las podemos probar —hace falta el componente
entero, temporizadores y una pasarela— pero **la regla sí**, y la regla es lo
que se nos escapó cuatro veces. Que esté escrita en un solo lugar, con nombre y
con los casos al lado, es lo que hace que la quinta vez se vea.

### La caja se limpia apenas la venta está confirmada

Antes se limpiaba al final, después de esperar a ARCA. Durante esos hasta 8
segundos el carrito seguía en pantalla, lleno y ya cobrado. Ahora se limpia en
cuanto `confirmarVenta` devuelve: lo que falta —encolar, esperar el CAE— no
necesita el carrito, porque trabaja con las constantes del closure.

Achica la ventana de 8 segundos a casi nada. El candado sigue haciendo falta
igual: achicar una ventana no es cerrarla.

### El asistente de cobro se cierra solo si no hay carrito

Red de abajo del "$ 0,00 — Cobro completo". Da igual por qué quedó abierto: sin
carrito no puede hacer nada útil y lo único que logra es asustar al cajero.

El paso "¿imprimir?" queda afuera: ahí el carrito **tiene** que estar vacío.

## Consecuencias

- Un cobro por venta, sin importar cuántos Enter lleguen ni cuándo.
- La caja se libera antes, así que se puede empezar a cargar la próxima venta
  mientras la anterior consigue su CAE.
- Si alguna salida del cobro electrónico se olvidara de soltar el candado, la
  caja quedaría trabada hasta salir y volver a entrar a la pantalla. Es el
  riesgo que se acepta a cambio de no emitir comprobantes de más.

## Lo que se hizo mal

Tres incidentes seguidos con la misma raíz, y cada vez se arregló el camino
puntual: el intervalo que se apagaba mal, el Enter que reentraba, el carrito que
se leía viejo. Ninguna de las tres veces se preguntó **cuál es la regla**.

La regla era de una línea: *no se arranca una venta si hay una en curso*. Lo que
costó fue que "en curso" tenía tres definiciones distintas, una por cada guarda,
y ninguna era la buena.
