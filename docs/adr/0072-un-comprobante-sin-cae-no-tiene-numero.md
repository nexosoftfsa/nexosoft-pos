# ADR-0072 — Un comprobante sin CAE no tiene número

Fecha: 2026-09-07
Estado: aceptado

## Contexto

En la prueba del 6/9/2026 la primera Factura A se imprimió, el cajero se llevó
el ticket, y la venta **no quedó registrada en ningún lado**. El POS mostró:

> venta · 80577cf7 · 5 intentos
> Invalid `prisma.venta.create()` invocation: Unique constraint failed on the
> fields: (`sucursalId`,`tipoComprobante`,`numeroComprobante`)

Lo mismo con la Nota de Débito: "Internal server error" tres o cuatro veces
antes de entrar. La Factura B, en cambio, salió a la primera.

### Por qué

Cuando ARCA no responde o rechaza, la venta se registra igual —eso está bien y
es todo el punto del offline-first— pero se guardaba con un número
**provisional** sacado de nuestra propia serie (`siguienteNumeroNoFiscal`). Ese
número ocupa un lugar en la misma columna, con el mismo `@@unique`, que después
va a usar el número real de ARCA.

Los rechazos del 4/9 dejaron sembrado exactamente eso: Factura A ocupando los
números 1 a 5, y Nota de Débito los números 1 y 2. ARCA venía empezando de 1 en
homologación para esos tipos. Todo cierra:

| | Provisionales del 4/9 | 6/9 |
|---|---|---|
| Factura A | 1, 2, 3, 4, 5 | 5 intentos, ARCA dio 1→5, los cinco chocaron. La venta siguiente sacó **6** |
| Nota de Débito | 1, 2 | chocó con 1 y 2, entró con el **3** |
| Factura B | 1, 2 | ARCA venía en 5765: **5766** a la primera |

### Lo que lo hace grave

`pedirCae` corre **antes** de abrir la transacción. Así que en cada intento
fallido la secuencia fue: ARCA autoriza → otorga CAE → el `INSERT` falla → se
descarta todo. **Cinco CAE quemados en la Factura A.** Quedan comprobantes
autorizados en ARCA que no existen en nuestra base — en homologación no pasa
nada, en producción es una diferencia fiscal.

Y el `conNumeroUnico` que envuelve el `INSERT` reintentaba tres veces con el
**mismo número de ARCA**, porque ese número no lo elegimos nosotros. No podía
resolver nada, y de paso tapaba lo único importante que había para contar.

## Decisión

### Un comprobante fiscal sin CAE se guarda con `numeroComprobante = null`

La correlatividad de la serie fiscal no es nuestra: la lleva ARCA. Un número
inventado mientras ARCA no responde no la mantiene, la sabotea.

La columna ya era `Int?` y PostgreSQL no considera iguales dos `NULL` en un
índice único, así que no hizo falta cambiar el esquema. Cuando el CAE llega,
`CaePendientesService` escribe el número real, como ya hacía.

Un `TicketNoFiscal` **sí** conserva su número propio: no existe en ARCA, nadie
se lo va a pisar, y necesita algo con qué identificarse.

### Los provisionales ya sembrados se limpian

Migración `20260907120000_numero_fiscal_solo_con_cae`: pone en `NULL` el número
de todo comprobante fiscal sin CAE. Sin esto el arreglo del código no alcanza —
las minas que ya están puestas siguen explotando a medida que ARCA avanza.

### Con un número de ARCA no se reintenta

`conNumeroUnico` reintenta sólo cuando el número lo elegimos nosotros. Si el
número vino de ARCA y hay colisión, se corta en el primer intento y se registra
como **discrepancia fiscal**, con el número y el CAE en el log y en el mensaje
que ve el cajero, que es lo que hay que anotar para regularizarlo.

### El ticket dice que no hay número, en vez de inventar uno

`DatosTicket.numero` pasa a `number | null`. Al reimprimir desde Comprobantes un
comprobante que todavía espera el CAE, el ticket dice "Sin numerar todavía".

Antes mostraba el provisional del servidor, que además **no coincidía con el del
ticket original**: el correlativo interno lo lleva la terminal que hizo la
venta. Seba lo vio en la prueba —el ticket decía 7 y Comprobantes 6— y tenía
razón en desconfiar.

## Consecuencias

- Una venta fiscal sin CAE ya no puede perderse por colisión de número.
- En Comprobantes, un comprobante esperando CAE muestra "—" en la columna
  Número. Es lo que corresponde: todavía no tiene.
- El QR no se genera sin número. No debería poder pasar (el QR exige CAE, y con
  CAE hay número), pero el tipo ahora lo admite y se chequea explícitamente:
  inventar un número dentro de un QR firmado sería peor que no imprimirlo.
- **Queda sin resolver** que el CAE se pida antes de la transacción. Con este
  arreglo la colisión no puede ocurrir, pero cualquier otra falla del `INSERT`
  entre el CAE y el commit deja la misma discrepancia. Hoy al menos se registra
  con todos los datos en vez de perderse.

## Lo que se hizo mal

El test que consagraba el error se llamaba **"igual le asigna número, para no
romper la correlatividad"**. Estaba escrito con la intención correcta y con el
modelo mental al revés: la correlatividad que importaba era la de ARCA, y
tocarla desde acá era justamente romperla.

Es la segunda vez en esta fase que numerar de más nos muerde. La primera fue el
número provisional que se imprimía como si fuera fiscal (ADR-0068). La regla
que faltaba escribir es más corta que las dos: **el que asigna el número es el
único que puede decir cuál es.**
