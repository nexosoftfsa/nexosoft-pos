# ADR-0058 — CAE real contra ARCA: quién factura, qué pasa si ARCA se cae

- **Estado:** aceptado
- **Fecha:** 2026-08-27
- **Reemplaza en parte a:** [ADR-0008](0008-servicio-fiscal-arca-aislado.md) (que
  dejaba el adaptador real sin implementar)

## Contexto

Hasta acá el CAE lo daba `ServicioCaeMock`: un número inventado que servía para
desarrollar, pero que no es un comprobante fiscal. Para emitir de verdad hacen
falta cuatro cosas que antes no estaban:

1. Hablar WSAA (ticket de acceso firmado en CMS) y WSFEv1 (pedido del CAE).
2. Saber con qué identidad se factura: CUIT, punto de venta y condición frente
   al IVA del comercio.
3. Armar el desglose de IVA que ARCA valida al centavo.
4. Decidir qué pasa cuando ARCA no contesta — que pasa seguido.

## Decisión

### Cada comercio factura con SU propio certificado

NexoSoft **no** emite comprobantes en nombre de sus clientes. Cada comercio
genera su clave y su pedido de certificado desde el POS, hace el trámite con su
Clave Fiscal y sube el `.crt` que le da ARCA. La clave privada se genera y se
queda en el servidor de ese comercio: no viaja por HTTP, no está en el repo, no
la vemos nosotros.

La alternativa —un certificado nuestro facturando por todos— era inviable: sería
declarar como propias las ventas de todos los clientes.

### Un selector decide en cada venta si va a ARCA o al mock

`ServicioCaeSelector` mira, en cada venta, si hay datos fiscales completos y
certificado en el servidor. Si los hay, usa `ServicioCaeArca`; si no, el mock,
que emite un ticket **no fiscal**.

Se decide en el momento y no al arrancar porque el comercio se da de alta
*después* de instalar: carga sus datos y su certificado desde Configuración, y de
la venta siguiente en adelante factura en serio, sin reiniciar nada.

Que un comercio sin alta caiga en el mock no es un modo de prueba: es el comercio
que todavía no está inscripto emitiendo tickets internos. Mandarlo a ARCA dejaría
cada venta pendiente para siempre.

### Una caída de ARCA no frena la venta

La venta ya ocurrió: el cliente pagó y se llevó la mercadería. Por eso el estado
fiscal es del comprobante, no de la venta:

| Estado | Qué pasó | Qué se hace |
|---|---|---|
| `AUTORIZADA` | ARCA dio el CAE | nada |
| `PENDIENTE` | ARCA no respondió | `CaePendientesService` reintenta cada 5 min |
| `RECHAZADA` | ARCA contestó que está mal | queda marcada; reintentar no sirve |
| `NO_APLICA` | ticket no fiscal | nada |

El reintento va **en orden de emisión y frena en la primera que falla**: ARCA
exige numeración correlativa por punto de venta, y saltear una la deja sin poder
autorizarse nunca.

El POS muestra `PENDIENTE` y `RECHAZADA` en la lista de comprobantes. Es el punto
que más veces nos falló en este proyecto: el sistema tenía el dato y no lo
mostraba, y el problema aparecía tarde y en otro lado.

### El desglose de IVA se calcula en el servidor, no se le cree al cliente

Los precios del comercio minorista son finales (IVA incluido) y ARCA pide neto e
IVA por separado, validando que `ImpTotal = ImpNeto + ImpIVA + ImpOpEx` al
centavo. `desglosarIvaIncluido` agrupa **primero** por alícuota y recién ahí
separa, derivando el neto por resta: así la suma cierra por construcción en vez
de arrastrar centavos línea por línea.

La alícuota de cada ítem sale del producto en la base del servidor. El descuento
global se prorratea, y la diferencia de redondeo que eso puede dejar se absorbe
en la base de la alícuota más grande.

El reintento de una pendiente **reconstruye el desglose desde los ítems
guardados**. Mandar sólo el total dejaría la factura con IVA en cero: un rechazo
en el mejor caso, y una factura mal emitida en el peor.

### Soporta A, B y C

- **C** (Monotributo): no discrimina. El total va entero a `ImpNeto` y **no** se
  manda el array de alícuotas; mandarlo discriminado es rechazo.
- **B**: discrimina en el pedido aunque no se imprima discriminado.
- **A**: igual que B, pero **exige CUIT del receptor**. Sin ese dato se corta
  antes de llamar a ARCA, con un mensaje que dice qué falta.

Se manda siempre `CondicionIVAReceptorId` (RG 5616/2024): omitirlo es rechazo.

## Consecuencias

- Un comercio puede seguir vendiendo con ARCA caída, y sus comprobantes se
  regularizan solos.
- El comercio ve qué quedó sin autorizar sin tener que preguntar.
- El entorno (`homologacion` / `produccion`) es un dato de configuración
  deliberado: pasar a producción es empezar a emitir comprobantes reales y no
  puede ser un efecto colateral de guardar otra cosa.
- Queda pendiente probarlo contra ARCA de verdad: acá no hay certificado
  habilitado. Lo que sí se verifica localmente es que la firma CMS del TRA la
  valide otra implementación (`node:crypto`), que es lo que comprueba WSAA.
