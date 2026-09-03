# ADR-0070 — Notas de Débito

Fecha: 2026-09-03
Estado: aceptado

## Contexto

El dominio tenía `notaDebitoPara()` desde el principio y los tipos
`NotaDebitoA/B/C` existían, pero **no había forma de emitir una**: el único
botón de Comprobantes era "Anular", que emite una Nota de Crédito.

Una Nota de Débito es la contracara de la de Crédito y las diferencias no son
de detalle:

| | Nota de Crédito | Nota de Débito |
|---|---|---|
| Qué hace | anula o reduce | **suma** |
| Monto | el total del original | **el suyo propio** |
| El original | queda ANULADO | **sigue vigente** |
| Stock | vuelve a entrar | **no se toca** |
| Cuenta corriente | (no aplica hoy) | **suma la deuda** |
| Cuántas por comprobante | una | **varias** |

Se emite por intereses de mora, un flete que se factura después, un ajuste de
precio hacia arriba. Nada de eso mueve mercadería.

## Decisión

### El concepto vive en la venta, no en un ítem

`ItemVenta` exige un `productoId` real, y una ND no vende productos. Se agregó
`Venta.conceptoLibre` (nullable, migración aditiva) con el texto que escribe el
cajero, y la impresión arma con él **una única línea** junto con el total.

Sin eso, una ND se imprimiría con el cuerpo vacío: el total abajo y nada arriba
explicándolo.

### El desglose sale del monto de la nota

`desgloseDeMontoUnico()` calcula neto e IVA sobre el importe **de la nota**, no
sobre el del original — son cifras distintas. Sin ítems de los que sacar la
alícuota, un débito por intereses o gastos va a la **general (21%)**, que es el
criterio habitual. En un comprobante C no se discrimina, igual que en la venta.

Si algún día hace falta elegir la alícuota, el concepto tendría que venir con su
tasa desde la UI.

### Qué no admite Nota de Débito

- **Un ticket no fiscal**: no es un comprobante ante ARCA.
- **Otra nota**: no se apilan.
- **Un comprobante anulado**: lo que se estaría cobrando pertenece a una
  operación que se dio de baja.

Y de paso se cerró un hueco que abrió la existencia de las ND: **anular** ahora
rechaza cualquier nota, no sólo las de crédito. Anular una NC sería emitir una
NC de una NC, y anular una ND es exactamente lo que hace una NC sobre la
factura.

### Varias notas sobre el mismo comprobante

A diferencia de la NC —una por venta— se pueden emitir varias ND sobre la misma
factura: los intereses de un mes, después los del siguiente. El `operacionId`
lleva un sufijo con un **UUID**.

La primera versión usaba `Date.now()` y **el test lo agarró**: dos notas
emitidas dentro del mismo milisegundo chocaban contra el unique de
`operacionId`. Es exactamente el tipo de bug que en producción aparece una vez
cada mil y nadie sabe explicar.

Acá el `operacionId` **no da idempotencia** como en la venta: la ND entra por
HTTP directo, no por la cola de sync, así que no hay reintento automático que
deduplicar. Lo que evita la nota doble es el botón deshabilitado mientras se
emite.

## Consecuencias

- Un comercio puede cobrar intereses o ajustes con un comprobante fiscal en
  regla, con su CAE y su QR.
- La ND hereda la letra del original y viaja con `CbtesAsoc`: ARCA la rechaza
  sin eso, igual que a la NC.
- Si la venta original fue fiada, la nota **suma a la cuenta corriente**. Es la
  parte que más fácil se olvidaba: emitir el comprobante sin que el cliente
  quede debiendo la diferencia.
- La migración es aditiva y nullable: una versión anterior del servidor sigue
  funcionando contra esta base.

## Lo que queda pendiente

- **Elegir la alícuota** del concepto (hoy siempre 21% en A y B).
- **Nota de Crédito parcial**: hoy anular es por el total. Devolver un solo
  producto de una venta de diez no se puede.
