# ADR-0083 — La Factura A imprime los renglones sin IVA

Fecha: 2026-09-24
Estado: aceptado

## Contexto

Lo trajo Rodrigo leyendo los requisitos de la Factura A. La norma es explícita:

> "Los precios unitarios deben ser **netos de impuestos**."
> "El **Precio Neto** será el resultado del precio unitario por la cantidad."

Nuestra Factura A imprimía el precio **final** por renglón y recién discriminaba
el IVA al pie:

```
Agua Mineral Sin Gas 1.5L   1   $ 10.000,00   $ 10.000,00
                                Subtotal neto  $ 9.714,46
                                IVA 21% (neto $ 8.264,46)  $ 1.735,54
```

Además de no cumplir, es un comprobante que **no se puede reconciliar**: el
renglón dice $ 10.000 y abajo aparece un neto de $ 8.264,46 que no sale de
ningún lado visible. El que recibe una A es un responsable inscripto que la
carga en su sistema, y necesita el neto por renglón.

Tercera vez seguida que el comprobante declarado a ARCA está bien —`ImpNeto` e
`ImpIVA` nunca estuvieron en discusión— y el papel no.

## Decisión

### El neto por línea lo calcula el dominio, repartiendo el redondeo

`calcularComprobante` devuelve, por línea, `neto` y `netoUnitario`.

Lo importante es **cómo**. La forma obvia —dividir cada línea por (1 + tasa) y
redondear— redondea una vez por renglón, y la suma queda a uno o dos centavos
del neto que se le declaró a ARCA. **Una Factura A cuyos renglones no suman su
propio neto es peor que una con renglones brutos**: ahí el error se ve, y
parece nuestro.

Así que el neto se calcula por grupo de alícuota —como siempre— y después se
**reparte entre las líneas del grupo** en proporción a su importe, con el resto
para la última. La suma cierra exacta por construcción, y el test lo fija con
el caso que lo rompe: tres líneas de $ 0,10, que por separado dan 0,08 cada una
y suman 0,24 contra un neto de grupo de 0,25.

`netoUnitario` es informativo: con cantidades fraccionadas, `netoUnitario ×
cantidad` puede diferir del `neto` en centavos. Manda el neto de la línea, como
en cualquier factura.

### Sólo la A

La B y la C llevan el precio final por renglón: es lo que paga el cliente y es
lo que corresponde, porque no discriminan. La regla vive en `lineasSinIva()`,
un solo lugar que consultan los tres renderers — el mismo criterio que
`subtotalNeto()`, y por el mismo motivo.

### El neto viaja congelado, igual que el desglose

`ItemVenta.neto` en el servidor, mandado por el POS al sincronizar. **No se
recalcula del lado del servidor.**

Es la misma decisión que ADR-0073 para el desglose de IVA, y por la misma
razón: si un producto cambia de alícuota entre la venta y la reimpresión,
recalcular haría que el duplicado imprima renglones distintos a los del
original. El duplicado tiene que decir lo que dijo el original, no lo que hoy
diríamos.

La columna es **nullable**. Las ventas anteriores al 23/9/2026 no lo tienen y
se reimprimen como salieron, con el precio final. Rellenarlas sería inventar un
renglón que quizá no es el que se emitió — y `lineasSinIva()` exige que **todas**
las líneas tengan neto, para que un comprobante no salga mitad neto y mitad
final.

## Consecuencias

- La A cierra sola: la suma de los renglones da el subtotal neto, y neto + IVA
  da el total.
- El encabezado de la tabla dice "P. Unitario neto" / "Importe neto" en el A4,
  y el ticket avisa "Precios sin IVA". No hay que deducirlo.
- No cambia nada de lo que se le declara a ARCA.
- Hay que publicar el servidor, con migración.

## Lo que se hizo mal

La Factura A se implementó mirando lo que ARCA exige **recibir** —`ImpNeto`,
`ImpIVA`, los renglones del detalle— y no lo que el comprobante tiene que
**mostrar**. Son dos conjuntos de requisitos distintos y sólo se leyó uno.

Es el mismo error que con la Transparencia Fiscal (ADR-0079) y con el exento
(ADR-0076): tres veces el dato declarado estaba bien y el papel no. La pregunta
que faltaba las tres veces es la misma, y ya está escrita: *¿qué tiene que
decir el papel, además de estar autorizado?*
