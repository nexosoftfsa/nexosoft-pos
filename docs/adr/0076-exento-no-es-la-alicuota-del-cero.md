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

## Lo que se hizo mal

Esto estuvo escrito como limitación conocida, en un comentario, durante meses. Y
la parte difícil —que el dominio supiera representar exento— ya estaba hecha: lo
único que faltaba era un `| null` en el tipo del catálogo y propagarlo.

La lección no es "había una deuda anotada", es **qué tan barato era pagarla**.
Quedó ahí porque el síntoma —un renglón de más en el ticket— parecía cosmético,
y no lo era: era el papel del cliente contradiciendo lo declarado ante ARCA.
