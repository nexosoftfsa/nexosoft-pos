# ADR-0041: Modo de venta sin alta en ARCA (TicketNoFiscal)

- **Estado:** Aceptada
- **Fecha:** 2026-08-01
- **Decisores:** Equipo NexoSoft
- **Relacionada:** ADR-0012 (condición fiscal del emisor), ADR-0028 (comprobantes
  y anulación con NC), ADR-0008 (servicio fiscal ARCA aislado)

## Contexto

Fase 10 (primeros pasos con un cliente real): un mini market probará NexoSoft en
paralelo a su sistema actual. Hoy **no está de alta en ARCA** — recién inició el
trámite — y legalmente no puede facturar; su sistema actual solo entrega
"tickets comunes sin valor como factura". Va a registrarse en ARCA en los
próximos días.

El sistema, sin embargo, **siempre** resolvía la venta como Factura A/B/C y
mostraba el estado crudo del `EstadoCae` (`"PENDIENTE_CAE"`) en el ticket, sin
ninguna noción de "este comercio todavía no factura". Eso es, como mínimo,
confuso para un comercio no registrado, y en cloud-api la venta quedaba
igualmente marcada `tipoComprobante: FacturaB` con un CAE mock — inconsistente
con lo que se le entrega al cliente en mano.

## Decisión

1. **Nuevo `TipoComprobante.TicketNoFiscal`** (`packages/domain`), sumado a
   `DOCUMENTOS_NO_FISCALES` junto con Remito/Presupuesto → `requiereCae()` da
   `false` y `letraDe()` da `"X"` (mismo tratamiento de IVA que un Remito: no se
   discrimina). A diferencia de Remito/Presupuesto, **sí es una venta real**:
   cobra, descuenta stock y queda registrada — solo que sin CAE ni numeración
   fiscal.
2. **`ConfiguracionComercio.emiteComprobantesFiscales?: boolean`** (opcional,
   default `true` = comportamiento histórico). En `false`,
   `ServicioDeVenta.armar()` **no llama** a `resolverTipoComprobante` (evita
   incluso la validación de condición de emisor) y resuelve directo
   `TicketNoFiscal`. El comprobante queda en `EstadoCae.Borrador` (no
   `PendienteCae`): nunca se ofrece "Solicitar CAE" para él.
3. **Editable en `PantallaConfig`** ("Ya está de alta en ARCA"), persistido en
   SQLite (`comercio_config.emite_comprobantes_fiscales`, columna nueva
   `DEFAULT 1`). El comercio prende el flag el día que completa el alta —sin
   reinstalar nada.
4. **El tipo viaja al cloud-api** vía `construirOperacionVenta`/`CrearVentaDto.
   tipoComprobante` (antes no se enviaba; el backend asumía siempre
   `'FacturaB'`). `VentasService.registrar`/`.anular` **no piden CAE** cuando el
   tipo es `TicketNoFiscal` (`esComprobanteFiscal()`), y persisten
   `cae`/`caeFechaVto`/`numeroComprobante` en `null`. **Anular un
   `TicketNoFiscal` no emite Nota de Crédito** (no tiene sentido fiscal): se
   marca `ANULADA` directo, reflejando el mismo tipo (`notaCreditoDe` extendido),
   restaurando stock igual que cualquier anulación.
5. **UI del ticket**: título "Ticket" (no "Factura B"), sin selector de
   condición del receptor (no aplica), estado "No válido como factura" en vez
   del enum crudo. En Comprobantes (reimpresión), la anulación de un ticket
   muestra un aviso genérico en vez de "Se emitió la Nota de Crédito…".

## Consecuencias

- Un comercio puede operar el sistema completo (stock, caja, reportes, control
  del dueño) **antes** de tener ARCA, sin fingir que emite comprobantes
  fiscales — ni en pantalla ni en los registros del servidor.
- Cuando el comercio se da de alta, alcanza con destildar el flag: no hay
  migración de datos ni cambio de arquitectura.
- El "loop productivo" fiscal (Factura A/B/C, CAE mock, NC) queda intacto y sin
  regresiones — verificado por tests y en el navegador.

## Alternativas consideradas

- **Bloquear la venta hasta tener ARCA** — descartado: es exactamente el
  escenario que el cliente real necesita evitar (quiere operar YA, en paralelo
  a su sistema viejo).
- **Reusar `Remito`/`Presupuesto` como "ticket de venta"** — descartado: esos
  tipos no representan una venta cobrada con stock descontado; hacerlo así
  hubiera exigido ramas especiales en `ServicioDeVenta` y confundido su
  semántica (documento interno vs. venta real).
- **Marcar la condición a nivel `Sucursal` en cloud-api** (en vez de viajar por
  venta) — descartado por ahora: el POS ya es la fuente de verdad del tipo de
  comprobante (offline-first); duplicarlo en `Sucursal` es redundante mientras
  no haya un caso de uso que lo necesite (ej. bloquear ventas fiscales desde el
  servidor).
