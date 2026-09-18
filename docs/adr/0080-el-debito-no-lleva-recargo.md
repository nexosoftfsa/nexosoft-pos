# ADR-0080 — El débito no lleva recargo, y no alcanza con validar el alta

Fecha: 2026-09-17
Estado: aceptado

## Contexto

La Ley 27.253 obliga a los comercios a aceptar tarjeta de débito y a hacerlo
*"sin aplicar recargo alguno"*. Defensa del Consumidor multa el incumplimiento.

Nuestro ABM de Medios de pago aceptaba un `recargoPorcentaje` en una tarjeta de
tipo `DEBITO` exactamente igual que en una de crédito: `validarTarjeta` sólo
miraba que el número fuera válido, y el servicio no miraba nada. Y el POS
después lo cobraba.

O sea: el software ayudaba al comercio a cometer la infracción, y el que pagaba
de más era el cliente del mostrador.

Apareció en el barrido normativo del 17/9/2026, no en una prueba de campo.

## Decisión

### La regla vive en el dominio

`ventas/recargo-de-tarjeta.ts`: `admiteRecargo`, `admiteCuotas`,
`recargoQueCorresponde` y `motivoTasaInvalida`. La usan las tres capas que
tienen que decir lo mismo — el servicio del servidor, el formulario del POS y el
cobro— en vez de repetir la condición en cada una.

Un débito tampoco tiene cuotas: es un pago único contra el saldo de la cuenta.
Una tarjeta de débito "en 6 cuotas" no existe, y dejarlo cargar sólo servía para
confundir al cajero.

### No alcanza con validar el alta: hay que blindar el cobro

Es la parte que importa y la que se iba a pasar por alto.

Un comercio que ya tenía una tarjeta de débito con recargo la sigue teniendo en
su base. Si sólo se validara el alta, esa configuración quedaría intacta y **el
POS le seguiría cobrando de más al cliente** hasta que alguien entrara a editar
la tarjeta. El arreglo habría quedado esperando a que alguien lo activara.

Por eso `recargoQueCorresponde(tipo, porcentaje)` se aplica **al cobrar**, no
sólo al guardar: en un débito devuelve cero siempre, venga lo que venga de la
configuración. Y también en la pantalla del asistente, para que la lista de
cuotas no anuncie un porcentaje que no se va a cobrar.

Son tres lugares distintos con la misma regla, y ninguno confía en el anterior:

| Dónde | Qué hace |
|---|---|
| `MediosPagoService` | rechaza guardarlo, con `BadRequestException` |
| `validarTarjeta` (formulario) | lo muestra antes de guardar, y avisa al elegir el tipo |
| `recargoQueCorresponde` (cobro) | lo ignora aunque esté guardado |

### El servidor valida la tarjeta *como va a quedar*

En `actualizarTarjeta` el tipo y las tasas son dos campos opcionales. Validar
sólo lo que viene en el DTO dejaba un agujero: pasar a débito una tarjeta de
crédito que ya tenía recargo, sin tocarle las tasas, entraba sin que nadie
mirara el recargo que ya tenía. Se valida la combinación resultante.

### El motivo dice la ley, no sólo que no se puede

"Una tarjeta de débito no puede tener recargo: la Ley 27.253 obliga a aceptarla
sin recargo alguno." Lo lee el dueño del comercio, y un "no se permite" sin
explicación invita a buscarle la vuelta. Además se aclara **al elegir el tipo**,
antes de que cargue un número que no va a poder guardar.

## Consecuencias

- Un comercio con una tarjeta de débito mal configurada deja de cobrar el
  recargo **de inmediato**, sin tener que hacer nada.
- Esa tarjeta no se puede volver a guardar hasta corregirla. Es deliberado: el
  dato queda mal en la base y conviene que alguien lo mire, en vez de que el
  sistema se lo reescriba por su cuenta.
- No se tocan datos existentes en ninguna migración. Lo que se cambia es qué se
  hace con ellos.

## Lo que se hizo mal

Esto no lo encontró una prueba ni un cliente: salió de sentarse a leer qué
obligaciones tiene un comercio que cobra, algo que nadie había hecho en catorce
fases. El mismo barrido encontró que las Facturas B venían mal desde abril de
2025 (ADR-0079).

La lección se parece a la del exento: la deuda no estaba escondida en el código,
estaba en no haber hecho la pregunta.
