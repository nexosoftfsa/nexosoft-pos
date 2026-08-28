# ADR-0060 — Emisión contra ARCA: lo que sólo falla con un certificado real

- **Estado:** aceptado
- **Fecha:** 2026-08-28
- **Complementa a:** [ADR-0058](0058-cae-real-contra-arca.md)

## Contexto

ADR-0058 dejó la facturación real implementada y sin probar contra ARCA. Una
revisión del módulo antes de esa primera corrida encontró cinco huecos que el
`MockServicioFiscal` **no puede mostrar**, porque el mock acepta lo que el
sistema le manda y ARCA no.

Los cinco aparecen recién con un certificado habilitado, y cuatro de ellos
aparecen con ventas reales de por medio. Ese es el peor momento para
encontrarlos.

## Decisión

### Una Nota de Crédito dice qué comprobante corrige

`CbtesAsoc` no se mandaba: no aparecía en ninguna parte del repo. ARCA lo exige
en notas de crédito y de débito (tipos 2, 3, 7, 8, 12 y 13), así que **toda
anulación habría vuelto rechazada** en cuanto el comercio facturara en serio.

Sale del original que se está anulando (`comprobanteAsociadoId`, que ya se
guardaba y no se usaba para esto), tanto al anular como al reintentar una NC
pendiente. `ClienteWsfev1` corta antes de llamar si el tipo lo exige y no vino.

**No se manda `CbteFch` del asociado** aunque el campo exista: es opcional, y si
no coincide al día con lo que ARCA tiene registrado es un rechazo. El tipo, el
punto de venta y el número alcanzan para identificarlo.

El punto de venta del asociado sale de la configuración fiscal actual, porque la
venta no lo guarda. Es correcto mientras el comercio no cambie de punto de
venta; si lo cambiara, la correlatividad ya estaría rota por otro lado.

### La numeración se pide en fila, por punto de venta y tipo

Pedir un CAE son dos llamadas: `FECompUltimoAutorizado` y `FECAESolicitar`. Con
dos cajas vendiendo a la vez, las dos leían el mismo último número y proponían
el mismo siguiente. ARCA rechaza el segundo por numeración no correlativa —y ese
rechazo **no es transitorio**, así que la venta quedaba `RECHAZADA` para
siempre.

`ColaPorClave` serializa por `entorno:cuit:puntoDeVenta:codigoComprobante`, que
es exactamente el alcance en el que ARCA exige correlatividad: dos cajas
facturando B y C a la vez no se estorban.

Es una fila en memoria, no un lock distribuido, porque cada comercio corre **un**
servidor: es el mismo proceso el que atiende a todas sus cajas.

### Si la respuesta se pierde, se pregunta antes de reintentar

El agujero más difícil de ver: ARCA otorga el CAE y la respuesta no vuelve
(timeout, corte de red). Del lado nuestro la venta queda `PENDIENTE`; del lado
de ARCA el comprobante existe. El reintento pedía el último número autorizado
—que ya incluía al emitido— y mandaba el **siguiente**.

Resultado: un comprobante vivo en ARCA que no figura en ningún lado acá, y un
agujero en la numeración que nadie ve hasta que lo encuentra el contador.

Ahora, ante un error **transitorio**, se consulta `FECompConsultar` por el número
que se propuso. Si ARCA lo tiene autorizado, se recupera ese CAE en vez de
emitir otro. Un rechazo no se consulta: ahí ARCA contestó.

Si la consulta también falla, se devuelve el error original y la venta queda
`PENDIENTE`: el mismo estado que si no hubiéramos preguntado. Cambiarlo por el
error de la consulta sería tapar la causa con un síntoma.

Queda un caso sin cubrir: que el servidor se caiga entre el pedido y la
respuesta. Ahí no queda ni el número propuesto. Cerrarlo pide guardar el número
antes de llamar, y es una migración que no entra en esta pasada.

### Ninguna llamada a ARCA espera para siempre

Ni WSAA ni WSFEv1 tenían timeout. Una conexión colgada dejaba la venta esperando
sin CAE y sin error — **ARCA lenta terminaba siendo peor que ARCA caída**, que
es justo lo que el diseño offline-first quiere evitar.

15 segundos para WSAA (todavía no se mandó ningún comprobante, cortar temprano
no deja nada en duda) y 20 para WSFEv1. Un corte por tiempo es transitorio: la
venta queda pendiente, no rechazada.

### Una pendiente que se pasó de fecha se marca, no se manda

Con `Concepto = 1` —todo lo que emite un POS de mostrador— ARCA no autoriza un
comprobante con fecha de más de 5 días. El reintento mandaba `venta.creadaEn`,
que es lo correcto: es la fecha que salió impresa en el ticket del cliente.

Pero si ARCA estuvo caída, o el comercio sin internet, más de 5 días, esas
ventas ya no se pueden autorizar con su fecha real. El reintento las mandaba
igual y se comía un rechazo que no explicaba nada.

Ahora se avisa desde el tercer día, y pasado el plazo la venta se marca
`RECHAZADA` con un motivo que dice de cuándo es y que hay que regularizarla con
el contador. **No se le cambia la fecha para que entre**: emitir una factura con
una fecha distinta de la del ticket que tiene el cliente es una decisión del
comercio y su contador, no del sistema.

Una vencida no frena a las que sí están en plazo: se marca y se sigue, igual que
con cualquier otro rechazo.

## Consecuencias

- Las anulaciones pueden autorizarse; antes ninguna podía.
- Dos cajas simultáneas dejan de generar rechazos por correlatividad.
- Un corte de red en el peor momento ya no deja comprobantes fantasma en ARCA,
  salvo que además se caiga el servidor en ese instante.
- El comercio ve venir las pendientes que se están por pasar de fecha, en vez de
  enterarse cuando ya no hay nada que hacer.
- Nada de esto cambia lo que ADR-0058 dejó dicho: **sigue sin probarse contra
  ARCA de verdad**. Lo que cambia es que cinco fallas seguras se corrigieron
  antes de esa prueba, en vez de descubrirlas con ventas reales adentro.
- `packages/fiscal/src/arca-servicio-fiscal.ts` dejó de anunciar que la
  facturación electrónica no estaba implementada: la implementación vive en
  `apps/cloud-api/src/fiscal/arca/` y el archivo ahora apunta ahí.
