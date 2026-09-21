# ADR-0079 — Transparencia Fiscal al Consumidor: qué se imprime y qué no se inventa

Fecha: 2026-09-17
Estado: aceptado

## Contexto

La Ley 27.743 (Régimen de Transparencia Fiscal al Consumidor) y su
reglamentación, la RG 5614/2024, exigen que todo comprobante emitido a un
consumidor final o a un sujeto exento lleve impreso:

1. La leyenda "Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)"
2. El renglón **IVA Contenido**, con su importe
3. El renglón **Otros Impuestos Nacionales Indirectos**, con el suyo

Es obligatorio **desde el 1/4/2025** para todos los contribuyentes. Nuestras
Facturas B salían con el total y nada más. Un año y medio de comprobantes mal
emitidos, en un producto que todavía no vendimos a nadie — de suerte.

### Lo que ya teníamos

El comprobante que se le declara a ARCA siempre estuvo bien: el IVA de una B se
calcula, viaja en el `FECAESolicitar` y queda congelado en la base con el
desglose de la venta. El dato que hay que imprimir es uno que ya teníamos.

Era, otra vez, un problema del papel.

## Decisión

### La regla vive en un solo lugar, como el subtotal neto

`transparenciaFiscal(datos)` en `@nexosoft/hardware`, al lado de
`subtotalNeto()`. Los tres renderers —térmica, ticket HTML y A4— la llaman.
Ya nos pasó poner una regla de impresión en un renderer y olvidarla en otro.

### Sólo la letra B

El régimen es para el consumidor final y el sujeto exento, que son a quienes se
les emite una B. La A va a un responsable inscripto, que ya recibe el IVA
discriminado renglón por renglón. La C la emite un monotributista o un exento:
no tienen IVA que discriminar. Las notas de crédito y débito B entran solas,
porque la regla es la letra.

### Sin desglose guardado, no se imprime nada

Un comprobante viejo reimpreso no tiene el detalle por alícuota. Sin él no se
sabe cuánto IVA tenía, y **un "IVA Contenido $ 0,00" en una B que sí lo tuvo es
peor que no imprimir nada**: el primero es un dato falso, el segundo es una
omisión visible. No se reconstruye.

### "Otros Impuestos Nacionales Indirectos" va en cero, y es un dato, no un default

Los impuestos internos son de **etapa única**: se pagan en el expendio, la
primera venta del fabricante o del importador (Ley 24.674). Un comercio que
revende una cerveza **no es sujeto pasivo de nada**. El interno ya está adentro
del precio que pagó, calculado sobre el precio de venta de la fábrica — un dato
que nunca vio y no puede deducir del precio de góndola.

Se evaluó agregar una tasa de impuesto interno por producto y aplicarla al
precio de venta. **Se descartó**: el número que saldría no sería el impuesto
interno de nada, sino una estimación nuestra con cara de dato fiscal, impresa
en un documento fiscal. Y el cálculo tampoco es un porcentaje simple — los
internos se liquidan sobre base acrecentada, `tasa / (1 − tasa)` — así que ni
siquiera sería una estimación prolija.

La norma no resuelve el caso del revendedor, y los tributaristas se lo están
reclamando a ARCA por escrito (el caso de las estaciones de servicio con el
impuesto a los combustibles es idéntico). Ante eso, la lectura defendible es la
literal: la operación del comercio no está gravada por internos.

Y hay evidencia de campo: **un ticket de supermercado imprime
"Imp. Internos: 0"**, vendiendo gaseosas y cervezas. El controlador fiscal de
ese supermercado tiene además una columna `[%I.I.]` por renglón, vacía en todos.

`DatosTicket.otrosImpuestosNacionales` existe y es opcional. Ausente = cero.
El campo está para cuando el comercio **sí** liquida internos (una fábrica, un
importador): ahí el importe lo pone quien lo liquida, no lo estima el POS. En
ese caso, además, el impuesto tiene que viajar a ARCA en `Tributos` y sumar a
`ImpTrib` — que es otra feature, en el servidor, y por eso no se mezcla con
ésta.

### El nombre del renglón se adapta al papel

"Otros Impuestos Nacionales Indirectos" no entra en 32 columnas ni abreviado.
En la térmica va **"Imp. internos"**, que es el único que le aplica a un
comercio y es lo que ya leen los consumidores en los tickets de supermercado.
En el A4 y el ticket en pantalla, donde hay lugar, va el nombre completo de la
norma. La leyenda del régimen va entera en los tres.

### Se agrega la aclaración de alcance

"Los impuestos informados son sólo los que corresponden a nivel nacional."
Sin eso, un consumidor suma IVA + internos y concluye que ésa es toda la carga
impositiva del precio, lo que deja afuera Ingresos Brutos y las tasas
municipales.

## De paso: la térmica y el A4 decían cosas distintas

Buscando dónde meter esto apareció que la impresión ESC/POS listaba los
subtotales de IVA **sin mirar la letra**, mientras el A4 y el ticket HTML sólo
los muestran en la A. O sea que la misma Factura B salía con "IVA 21%" por
térmica y sin nada por A4 — exactamente lo que `subtotalNeto()` existe para
evitar. No lo vio nadie porque todavía no hay térmica conectada. Corregido: el
desglose por alícuota es de la A, y lo que lleva una B es este bloque.

## Consecuencias

- Las Facturas B cumplen con el régimen desde POS 0.1.65.
- No hace falta tocar nada de lo que se le declara a ARCA.
- Un comprobante emitido antes de que se guardara el desglose se reimprime sin
  el bloque. Es un límite conocido y preferible a inventar el importe.

## Corrección del 21/9/2026: "no se sabe" no es "es cero"

La regla de arriba —*sin desglose guardado no se imprime nada*— estaba bien
pensada y mal implementada. Se apoyaba en que `subtotalesIva` estuviera vacío
para decidir que no se sabía cuánto IVA tenía el comprobante, y ese arreglo
puede estar vacío **con todo el derecho del mundo**: una Factura B de puros
productos exentos no lleva ningún renglón de IVA, porque ante ARCA lo exento va
a `ImpOpEx`.

Sebastián reimprimió una B de seis productos exentos y salió sin el bloque. El
original, en cambio, lo llevaba con `$ 0,00` — o sea que el mismo comprobante
cumplía en un papel y no en el otro.

Son dos situaciones distintas que se estaban tratando igual:

| Situación | ¿Se sabe el IVA? | Qué corresponde |
|---|---|---|
| Comprobante viejo, sin desglose guardado | no | no imprimir |
| Comprobante de puros exentos | **sí: es cero** | imprimir `$ 0,00` |

`DatosTicket.ivaContenido` lleva ahora el importe **informado**, que la
reimpresión toma del `impIva` que guardó el servidor, y manda sobre la suma de
los renglones. Si ese campo no está —los comprobantes anteriores a que se
guardara el desglose— sigue sin imprimirse nada.

La lección: **no se deduce un dato fiscal de la ausencia de filas.** La
ausencia puede significar "no hay" o "no lo guardamos", y son cosas distintas.

## Lo que se hizo mal

Nadie preguntó por esto en catorce fases. Se implementó el CAE, el QR fiscal,
las notas de crédito, la Factura A y B, los comprobantes asociados — y no se
leyó qué más tenía que decir el papel. El régimen estaba vigente desde antes de
que empezáramos a emitir.

La pregunta que faltó no es técnica y es de una línea: *¿qué obligaciones tiene
hoy un comprobante a consumidor final, además de estar autorizado?*
