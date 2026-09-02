# ADR-0063 — La nota de crédito dice en el papel qué comprobante corrige

Fecha: 2026-09-01
Estado: aceptado

## Contexto

El 01/09/2026 se cerró el circuito fiscal completo contra ARCA **producción**:
Factura C `0002-00000003` (CAE `86351023067383`) y su Nota de Crédito C
`0002-00000001` (CAE `86351024159042`), las dos constatadas en la página
pública de ARCA. Fue la primera vez que la anulación corrió contra ARCA de
verdad.

Al revisar los PDF apareció un hueco: **la nota de crédito impresa no dice qué
comprobante anula.** Trae razón social, tipo, número, fecha, ítems, total, CAE y
QR — y nada más.

ARCA sí lo sabe: la solicitud de CAE manda `CbtesAsoc` con el tipo, punto de
venta y número del original (ADR-0060), y sin eso la rechaza. El dato estaba en
el servidor y llegaba al organismo, pero **no al papel que se lleva el cliente**.

Una nota que no identifica el comprobante que corrige no cumple con el régimen
de comprobantes, y en la práctica el contador del comercio no la puede conciliar
contra nada.

La causa era de datos, no de layout: `DatosTicket` —el contrato que comparten el
ticket HTML, el A4 y la térmica ESC/POS— no tenía dónde ponerlo, y el servidor
devolvía `comprobanteAsociadoId` (un UUID) pero no el tipo ni el número.

## Decisión

**Lo que ARCA recibe en `CbtesAsoc`, el comprobante impreso también lo dice.**

1. `DatosTicket` gana `comprobanteAsociado?: { tipo, puntoDeVenta, numero }`
   (`packages/hardware/src/impresora.ts`), presente sólo en notas de crédito y
   de débito.
2. El formato lo arma una sola función, `identificacionComprobanteAsociado()`
   → `"Factura C 0002-00000003"`. Los tres renderizadores la usan: si el formato
   cambia, cambia en un solo lugar y no se desincronizan.
3. El servidor resuelve la relación: `historial` y `obtener` traen
   `comprobanteAsociado: { select: { tipoComprobante, numeroComprobante } }`.
   Con el id solo no se puede imprimir nada.
4. El punto de venta sale de la configuración de la terminal: el original y su
   nota se emiten siempre desde el mismo, y la venta no guarda uno propio.
5. Si el servidor no resolvió el asociado —comprobantes viejos, anteriores a
   este cambio— **no se imprime la línea**. Mejor sin la leyenda que con una
   leyenda incompleta.

## Consecuencias

- Las notas de crédito nuevas salen con `Comprobante asociado / Factura C
  0002-00000003` en el ticket, el A4 y la térmica.
- Las notas emitidas antes de este cambio se reimprimen sin la leyenda. No se
  reconstruye hacia atrás: el dato está en la base (`comprobanteAsociadoId`),
  así que se puede agregar después si hace falta.
- `registrarEnLibro` pasó a tipar su parámetro con `Omit<…,
  'comprobanteAsociado'>`: el libro de ventas no usa la relación, y exigirla
  obligaría a traerla en el `create` de la venta, que nunca la tiene.

## Alternativas descartadas

- **Resolver el asociado en el POS**, buscándolo en la lista ya cargada. Falla
  con el filtro "Hoy" puesto, o si el original es de otro día: justo cuando más
  falta hace.
- **Guardar el texto ya armado al emitir la nota.** Duplica un dato que ya está
  en la relación y queda viejo si el original se renumera.
