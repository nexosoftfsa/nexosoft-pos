# ADR-0050: Medios de pago (tarjetas por banco) y recargo por tarjeta

- **Estado:** Aceptada
- **Fecha:** 2026-08-16
- **Decisores:** Equipo NexoSoft
- **Relacionada:** ADR-0030 (recargo global — deja anotado como evolución
  futura "una tabla de recargos por medio", que esta ADR implementa),
  ADR-0029 (pago combinado), ADR-0013 (cálculo de comprobante)

## Contexto

El cliente pidió poder configurar tarjetas de crédito/débito por banco con
sus tasas de interés según cantidad de cuotas, en un módulo dedicado
"Medios de pago", y que esa tasa se aplique automáticamente al cobrar —
pero **solo sobre la porción de la venta pagada con esa tarjeta**, no sobre
el total del ticket. Además pidió mantener los botones de recargo manual
existentes (Sin/10%/15%) en paralelo, no reemplazarlos.

El punto delicado es que el motor fiscal (`calcularComprobante`,
ADR-0013/ADR-0030) aplica el recargo como **un único porcentaje global, por
línea, antes de descomponer el IVA**, para mantener la invariante
`netoGravado + iva = total` que exige Factura A. Discriminar un recargo
distinto por cada pago dentro de ese cálculo — con múltiples tarjetas a
distintas tasas en una misma venta combinada — hubiera significado
reescribir esa lógica, con el riesgo fiscal que eso implica.

## Decisión

### 1. Módulo de configuración (`TarjetaConfig` + `TasaCuota`)

Modelos nuevos en `apps/cloud-api`, mismo patrón que Proveedores
(soft-delete, `sucursalId`): `TarjetaConfig` (banco, tipo DEBITO/CREDITO,
marca opcional, activo) con `TasaCuota[]` (cantidadCuotas,
recargoPorcentaje), reemplazando el set completo de tasas en cada
actualización. ABM dedicado en el POS ("Medios de pago", sección Gestión).

### 2. El recargo de tarjeta **no toca el cálculo fiscal**

En vez de meter el recargo de tarjeta dentro de `calcularComprobante`, se
lo trata como un monto que se **suma después**, a nivel de cobro:

- `Pago` (dominio) gana campos opcionales de trazabilidad:
  `tarjetaConfigId`, `cuotas`, `recargoAplicado: Money` — no participan del
  cálculo del comprobante, solo documentan qué recargo llevó ese pago
  puntual.
- En `packages/app/src/ventas/servicio-venta.ts`, el `total` que se le pasa
  a `calcularCobro` (que solo suma montos de pago, sin tocar IVA) es
  `resultado.total + Σ recargoAplicado` de los pagos con tarjeta. El
  `resultado.total` fiscal —el que va en la Factura A/B, con
  `netoGravado + iva = total`— **no cambia**.
- `calcularComprobante` y `calcularCobro` quedan sin ninguna modificación
  de lógica: cero riesgo de romper la invariante fiscal existente.
- Los botones de recargo manual (Sin/10%/15%) siguen funcionando exactamente
  igual que antes (ADR-0030), sobre el `recargoPorcentaje` global — conviven
  con el recargo de tarjeta sin interferirse: uno ajusta el total fiscal, el
  otro es un adicional que se cobra por fuera.

### 3. En el POS: tarjeta + cuotas por pago, monto base vs. monto a cobrar

Al elegir forma de pago "Tarjeta", aparecen selects de banco (tarjetas
activas) y cuotas (tasas de esa tarjeta). El cajero tipea el **monto base**
de esa porción; el recargo se previsualiza en vivo
(`+ $X recargo = $Y a cobrar`) y, al agregar el pago, se guarda
`monto = base + recargo` junto con `tarjetaConfigId`/`cuotas`/
`recargoAplicado`. El ticket en pantalla muestra por separado
"TOTAL" (fiscal), "Recargo tarjeta" y "Total a cobrar".

### 4. Persistencia y sync

`Pago` (backend) gana columnas nullable `tarjetaConfigId` (FK
`onDelete: SetNull`, para no romper pagos históricos si se desactiva o
borra una tarjeta), `cuotas`, `recargo`. `PagoVentaDto` las expone como
opcionales, retrocompatible con clientes viejos. `mapeo.ts` las propaga en
el payload de sync y deriva `TARJETA_CREDITO` vs `TARJETA_DEBITO` del tipo
de tarjeta elegida (antes siempre mandaba débito a secas).

## Consecuencias

### Positivas

- Se logra "recargo solo sobre la porción de la tarjeta" con tasas por
  banco y por cantidad de cuotas, sin tocar una línea del motor de cálculo
  fiscal (`packages/domain`), que es la pieza más riesgosa del sistema.
- Los botones de recargo manual y el recargo automático de tarjeta
  conviven sin conflicto: son magnitudes independientes.
- Trazabilidad completa por pago (`tarjetaConfigId`, `cuotas`,
  `recargoAplicado`) queda persistida para reportes futuros (no
  implementados en esta fase, pero los datos ya están).

### Negativas / costos (aceptadas conscientemente)

- **El monto efectivamente cobrado (`cobro.pagado`) puede superar el
  `total` fiscal declarado en la Factura A/B** cuando hay recargo de
  tarjeta: ese adicional no se redeclara con IVA discriminado dentro del
  comprobante, se cobra "por fuera" y se transparenta en el ticket como
  línea separada ("Recargo tarjeta" / "Total a cobrar"). Es una diferencia
  de fondo entre el total fiscal y el total cobrado — se documenta acá
  explícitamente por si en el futuro ARCA u otro requisito obliga a
  discriminar ese recargo dentro del comprobante mismo (en ese caso, sería
  necesario retomar `calcularComprobante` para hacerlo por pago en vez de
  global).
- Si se combinan varios pagos con tarjeta a distintas tasas en una misma
  venta, cada uno lleva su propio `recargoAplicado`, pero el ticket solo
  muestra el total agregado (`recargoTarjetasTotal`), no el desglose por
  tarjeta — suficiente para esta fase, ampliable si se pide.
- El desglose de pagos (banco/cuotas) en el ticket depende de que el
  estado `pagos` del POS siga disponible al momento de imprimir; si se
  reinicia antes de imprimir, el ticket muestra el total pero no la
  etiqueta de tarjeta — limitación preexistente del flujo de impresión
  (`pagos` se limpia junto con el resto del carrito al confirmar la venta),
  no introducida por esta fase.

## Alternativas consideradas

- **Discriminar el recargo de tarjeta dentro de `calcularComprobante`,
  por pago** — descartado por ahora: exige repensar la descomposición de
  IVA cuando hay múltiples tasas en una misma venta combinada, con riesgo
  fiscal alto para un pedido que no exigía que el recargo apareciera
  discriminado en el CAE, solo que se cobrara correctamente y se viera en
  el ticket.
- **Reemplazar los botones de recargo manual por el automático de
  tarjeta** — descartado: pedido explícito del cliente de mantener ambos.
- **Recargo como porcentaje único (no por cantidad de cuotas)** —
  descartado: pedido explícito del cliente de tener tasas distintas según
  cuotas.
