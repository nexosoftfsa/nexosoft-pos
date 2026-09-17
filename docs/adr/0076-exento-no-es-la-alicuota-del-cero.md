# ADR-0076 — Exento no es la alícuota del 0%

Fecha: 2026-09-16
Estado: aceptado

## Contexto

`Articulo.alicuotaIva` no admitía `null`, así que el POS traducía el `EXENTO`
del servidor a la alícuota del 0%. El propio mapeo lo decía, como limitación
conocida:

```ts
//  - `EXENTO` se mapea a alícuota 0% (el dominio no distingue exento de 0%).
const ALICUOTA_POR_TIPO = { EXENTO: ALICUOTAS_IVA.CERO, ... };
```

Pero **el dominio sí distinguía**: `LineaParaDesglose.alicuota` acepta `null`
desde siempre, y hay un test que lo dice con todas las letras — *"No es lo mismo
que exento: ARCA quiere el renglón con Id 3"*. El servidor también:
`alicuotaDeTipoIva('EXENTO')` devuelve `null` y el importe va a `ImpOpEx` sin
renglón de IVA.

El único que no distinguía era el catálogo del POS.

### Qué rompía en la práctica

**El comprobante que se le declara a ARCA siempre estuvo bien**, porque el
servidor calcula el desglose con su propio `tipoIva` y nunca miró la alícuota
del POS.

Lo que estaba mal era **el papel**. Un producto exento imprimía:

```
IVA 0%                    $ 0,00
```

…y sumaba su importe al "Subtotal neto", mientras el comprobante fiscal
correspondiente no tenía ningún renglón de IVA y declaraba ese importe como
exento. El ticket que se lleva el cliente y lo que ARCA tiene registrado decían
cosas distintas sobre la misma venta.

Sebastián se cruzó con esto sin saberlo: para poder probar una Factura A tuvo
que editar el aceite de exento a 21%, porque con el producto exento la factura
salía con `ImpNeto = 0` y todo en `ImpOpEx` — correcto, pero inútil como prueba.

## Decisión

### `Articulo.alicuotaIva` pasa a `AlicuotaIva | null`, y `null` es exento

Con eso el catálogo puede representar lo que el dominio y el servidor ya sabían
representar. `EXENTO` del servidor mapea a `null`.

### Para la plata, exento y 0% son lo mismo; para ARCA, no

Se agregó `porcentajeDeAlicuota(alicuota | null)`, que devuelve 0 para exento.
El cálculo de precios y de margen la usan: no hay IVA que sumar en ninguno de
los dos casos, y no tiene sentido duplicar la lógica.

La diferencia vive donde corresponde, en el desglose: `calcularComprobante`
agrupa lo exento en una clave propia (`-1`, que ningún porcentaje puede ocupar)
para que no se mezcle con el 0%.

### En SQLite, exento es NULL

Y se chequea **antes** de convertir a número: `Number(null)` es `0`, así que sin
ese chequeo un exento volvería de la base como alícuota del 0% — exactamente la
confusión que esto viene a arreglar.

### En el papel, un exento muestra su base

`montoDelSubtotal()` devuelve el IVA de una alícuota y **la base** de un exento:
su IVA es cero por definición y mostrar "$ 0,00" no le dice nada a nadie. Lo que
el contador necesita saber es cuánto del comprobante no estaba gravado.

Y `subtotalNeto()` excluye lo exento: no es neto gravado, y sumarlo daba un
"Subtotal neto" distinto del `ImpNeto` declarado.

### Un tipo de IVA desconocido cae al 21%, no a exento

Mismo criterio que el servidor. Un producto mal configurado tiene que pagar IVA:
lo contrario sería una diferencia a favor del comercio ante ARCA, que es el lado
equivocado para equivocarse.

## Consecuencias

- El ticket y el comprobante fiscal dicen lo mismo.
- **No hace falta migrar nada del lado del POS.** Los artículos que hoy están
  guardados como 0% en el SQLite de cada terminal se corrigen solos en el
  próximo pull del catálogo, porque el servidor tiene el `tipoIva` bueno.
- Una Factura A de sólo productos exentos no muestra "Subtotal neto", que es lo
  correcto: no hay nada gravado.

## Apéndice del 17/9/2026: el arreglo no llegaba al papel

La prueba de campo salió igual que antes: el ticket seguía imprimiendo
`IVA 0%` y sumando el exento al subtotal neto.

El arreglo estaba bien. Lo que fallaba era que **el catálogo corregido no bajaba
a la terminal**. El POS trae el catálogo del servidor sólo al arrancar; el botón
"Sincronizar" únicamente subía la cola de ventas. Así que un producto corregido
en el panel no llegaba a la caja por más que se tocara el botón, y no había
ninguna forma de traerlo sin cerrar y volver a abrir el programa.

Lo prueba el mismo comprobante impreso dos veces. El ORIGINAL, armado con el
catálogo viejo de la terminal:

```
Subtotal neto     $ 9.714,46
IVA 0%                $ 0,00
IVA 21%           $ 1.735,54
```

El DUPLICADO, armado con el desglose congelado tal como se le declaró a ARCA:

```
Subtotal neto     $ 8.264,46
IVA 21%           $ 1.735,54
```

Sin renglón de IVA 0%, y con el exento afuera del neto. El duplicado es el que
está bien. Ese renglón de diferencia entre un comprobante y su propia copia es
exactamente la contradicción que ADR-0076 venía a cerrar.

**Desde 0.1.64 el botón "Sincronizar" también baja el catálogo** cuando lo
aprieta una persona (no en la corrida automática cada 15 segundos, que no tiene
por qué pedir el catálogo entero).

## Lo que se hizo mal

Esto estuvo escrito como limitación conocida, en un comentario, durante meses. Y
la parte difícil —que el dominio supiera representar exento— ya estaba hecha: lo
único que faltaba era un `| null` en el tipo del catálogo y propagarlo.

La lección no es "había una deuda anotada", es **qué tan barato era pagarla**.
Quedó ahí porque el síntoma —un renglón de más en el ticket— parecía cosmético,
y no lo era: era el papel del cliente contradiciendo lo declarado ante ARCA.
