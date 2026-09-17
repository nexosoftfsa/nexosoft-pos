# ADR-0078 — Una operación en `enviando` no es de nadie

Fecha: 2026-09-17
Estado: aceptado

## Contexto

Sebastián arrastró **dos ventas sin subir durante cuatro pruebas**. Siempre el
mismo reporte:

> "Me figura 2 ventas con error en el panel arriba a la derecha, y no me deja
> ver el motivo ni nada. Le doy sincronizar y no hace nada."

El 16/9 se agregó el panel "Siguen intentando", para que una venta pendiente que
ya falló mostrara su motivo. El 17/9 Sebastián probó y contestó:

> "No aparece el botón *Ver motivo*. La leyenda sigue *2 ventas sin subir*."

Ahí se vio. No es que no se mostrara el motivo: **esas operaciones no estaban
fallando**. Estaban en `enviando`.

### Por qué ese estado es un pozo

`enviando` es de tránsito. Se marca justo antes de hablar con el servidor y dura
lo que dura esa llamada. Si el proceso muere en el medio —se cierra el POS, se
corta la luz, se reinicia Windows— la operación queda ahí. Y ahí no la mira
nadie:

| Quién | Qué mira | ¿Ve una `enviando`? |
|---|---|---|
| `pendientes()` (el motor) | `estado = 'pendiente'` | no → **no se reintenta nunca** |
| `reintentarFallidas()` (botón Reintentar) | `estado = 'fallida'` | no |
| `descartarFallidas()` (botón Descartar) | `estado = 'fallida'` | no |
| "ver motivo" | `intentos > 0` | no: nunca llegó a fallar |
| el contador de la píldora | `pendiente` + `enviando` | **sí** |

El único que las cuenta es el único que no puede hacer nada con ellas. Por eso
la píldora quedaba encendida para siempre, y por eso "sincronizar no hace nada":
literalmente no había nada que hacer, el motor no las veía.

Que el bug haya sobrevivido cuatro pruebas no es casualidad. Era invisible por
construcción: no aparecía en ninguna lista de problemas, sólo en un número.

## Decisión

### Al arrancar, lo que quedó en `enviando` vuelve a `pendiente`

`AlmacenDeOperaciones.recuperarEnviando()`, una vez, al crear el entorno.

Si el proceso está arrancando, no hay ningún envío en vuelo: todo lo que diga
`enviando` es de una vida anterior. Reenviar es seguro, porque el servidor
descarta los duplicados por `operacionId` (ADR-0005). **Que una venta se suba
dos veces no puede pasar; que no se suba nunca, sí pasó.**

No se tocan `intentos` ni `ultimo_error`: son la única pista de por qué venía
costando, y borrarlos sería tapar el problema justo cuando por fin se puede ver.

### El envío tiene tope de tiempo

30 segundos. Un `fetch` sin tope puede quedarse colgado para siempre —el
servidor acepta la conexión y no contesta, que es lo que pasa cuando la PC del
servidor se suspende— y mientras tanto las operaciones se quedan en `enviando`
**dentro de la misma sesión**, donde el rescate de arranque no llega.

Pasado el tope es una falla de transporte como cualquier otra: no gasta
reintentos (ADR-0066) y la cola se vuelve a intentar sola.

### "Trabada" ya no exige motivo

Antes una operación aparecía en el panel sólo si tenía `intentos > 0` **y** un
mensaje. La idea era no mostrar renglones vacíos; el efecto fue esconder
justamente el caso peor, el de la falla sin registro. Ahora alcanza con que haya
fallado: sin mensaje el panel dice "sin detalle", que es poco, pero saber que
hay una venta trabada vale más que el texto.

## Consecuencias

- Las dos ventas de Sebastián suben solas la próxima vez que abra el POS.
- Un cierre del POS a mitad de una sincronización deja de costar una venta
  invisible.
- Una operación reenviada puede llegar dos veces al servidor. Es exactamente
  para lo que existe `operacionId`.

## Lo que se hizo mal

El estado `enviando` se agregó para poder contar lo que estaba en vuelo, y nunca
se preguntó qué pasa si el vuelo no termina. La máquina de estados estaba
dibujada en el README como `pendiente → enviando → completada | fallida`, con
las dos flechas de salida bien puestas y sin decir que hay una tercera salida
—que el proceso muera— que no lleva a ningún lado.

Y el síntoma estuvo cuatro pruebas a la vista, contado en un número, mientras se
lo buscaba en la lista de errores. Cuando un contador y una lista no coinciden,
el que tiene razón es el contador.
