# ADR-0087: Lo que el contador marcó en el comprobante

- **Estado:** Aceptada
- **Fecha:** 2026-10-12
- **Decisores:** Equipo NexoSoft, sobre el informe del contador del 12/10/2026
- **Relacionada:** ADR-0085 (datos del emisor en el encabezado), ADR-0079
  (Transparencia Fiscal), ADR-0084 (el papel y ARCA dicen lo mismo), ADR-0076
  (exento no es la alícuota del 0%)

## Contexto

Se le pasaron comprobantes de muestra a un contador. Su veredicto de fondo fue
bueno —letras bien usadas, numeración separada por tipo, cálculos que cierran,
Transparencia Fiscal completa en el A4— y marcó seis faltantes. Mandó además
**un ticket real de un comercio de Formosa** como referencia, que terminó
resolviendo varias decisiones de formato que íbamos a tomar a ojo.

Tres de los seis puntos —domicilio comercial, Ingresos Brutos e inicio de
actividades— ya estaban resueltos ese mismo día en ADR-0085, por un relevamiento
propio. Que dos revisiones independientes llegaran a lo mismo es la mejor señal
que tuvimos de que ese análisis estaba bien hecho.

## Decisión

### 1. El código de comprobante va impreso, rotulado

`CODIGO N° 06` debajo del tipo (01 Factura A, 06 Factura B, 11 Factura C…). El
dato ya existía —es el que viaja adentro del QR fiscal— y simplemente no se
imprimía.

Un comprobante **no fiscal no lleva código**: un ticket interno no existe para
ARCA y ponerle uno sería mentir en el papel, que es la regla que ya rige el
número fiscal provisional (ADR-0065).

### 2. El nombre del impuesto es el que fija la norma, aunque no entre

El papel angosto decía **"Imp. internos"**. La decisión original fue
deliberada: el nombre completo no entra en 32 columnas y se eligió el del único
impuesto que le aplica a un comercio, igual que los tickets de supermercado.

**Era el concepto correcto y el texto equivocado.** La Ley 27.743 fija el texto,
no la idea. El ticket de referencia muestra la salida: el nombre **partido en
dos renglones**, con el importe a la derecha del último.

```
Otros Impuestos
Nacionales Indirectos     $ 0,00
```

### 3. Las etiquetas del encabezado se acortan sólo en el rollo

En 58mm, `Ingresos Brutos:` e `Inicio de actividades:` se comen el renglón y el
dato cae al siguiente. El ticket de referencia usa `IB:` e `Inicio Act.:`, que
entran enteros.

`renglonesDelEmisor` recibe entonces un modo compacto. **Sigue siendo una sola
función**: lo que cambia es la etiqueta, no qué se imprime ni en qué orden. El
A4, que tiene lugar, mantiene los nombres completos.

### 4. El vencimiento del CAE, en los tres

Lo tenían el A4 y la térmica. Faltaba en el **ticket chico HTML** — que es
justamente el formato que el contador vio como PDF.

**Es la cuarta vez que los tres renderers no dicen lo mismo**: el original
contra el duplicado (29/9), el exento en el A4 (30/9), la transparencia al pie
izquierdo (1/10) y ahora esto. Por eso todo lo que esta ADR agrega entra como
**función compartida en `@nexosoft/hardware`** —`codigoDeComprobanteImpreso`,
`ETIQUETA_OTROS_IMPUESTOS`, `OTROS_IMPUESTOS_ANGOSTO`— y no como tres copias.

### 5. El arroz exento no es un bug: es un dato

El contador pidió "que cada producto pueda tener su propia alícuota y que no
quede en exento por defecto". Se revisó y **las dos cosas ya se cumplen**:

- El formulario de producto ofrece 21%, 10,5%, 27% **y Exento**.
- Un producto nuevo nace en **21%**, no exento.
- El mapeo del catálogo del servidor manda lo desconocido a **21%**, nunca a
  exento (se corrigió el 16/9, ADR-0076).

O sea que el arroz está cargado como EXENTO **en el catálogo**, y se corrige
desde Catálogo y Precios en dos clics. No se cambió nada de código por este
punto, y conviene que quede dicho: era razonable sospechar un default, y no lo
es.

## Consecuencias

### Positivas
- El comprobante cumple con lo que marcó el contador, salvo lo que ya era dato.
- Lo nuevo nace compartido entre los tres renderers, que es donde se nos
  escapan las diferencias.

### Negativas / costos
- El bloque de transparencia ocupa **un renglón más de papel** en cada Factura
  B. Es el costo de usar el texto de la norma.
- En la térmica sale `CODIGO N 06`, sin el `°`: el juego de caracteres del
  ESC/POS es ASCII y ahí ya se pierden los acentos (`Regimen`, `solo`). El A4 y
  el ticket HTML sí lo llevan.
- El modo compacto es un `if` más en una función que queríamos sin variantes.
  Se acepta porque la alternativa —dos funciones— es cómo empiezan siempre las
  divergencias.

## Pendiente de verificación

Nada de esto se vio impreso todavía. La salida ESC/POS se revisó renderizándola
a texto y coincide con el ticket de referencia, pero **el A4 y el ticket chico
necesitan una impresión real**, junto con los datos del emisor de ADR-0085 que
tampoco se cargaron nunca.
