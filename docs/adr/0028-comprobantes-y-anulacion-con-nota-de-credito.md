# ADR-0028: Comprobantes y anulación con Nota de Crédito (online)

- **Estado:** Aceptada
- **Fecha:** 2026-07-02
- **Decisores:** Equipo NexoSoft
- **Relacionada:** ADR-0008 (servicio fiscal ARCA aislado), ADR-0025 (ABM online),
  ADR-0026/0027 (caja / cuentas corrientes)

## Contexto

La Fase 7.6 agrega **Comprobantes y anulaciones** al POS: ver los comprobantes
emitidos, anular (que en Argentina se hace **emitiendo una Nota de Crédito**, no
borrando) y reimprimir. La maqueta solo lo simulaba.

El dominio (`@nexosoft/app`) ya tiene la lógica fiscal de NC/ND
(`ServicioDeFacturacion`, letra heredada, comprobante asociado), pero opera sobre
el repositorio local, que **no expone un listado** de comprobantes y cuya
reconstrucción completa desde SQLite sería frágil. El resto de los módulos de
gestión de la Fase 7 son **online** contra el servidor de sucursal.

## Decisión

1. **Comprobantes online**, consistente con 7.2–7.5: la pantalla lista las ventas
   del `cloud-api` (`GET /ventas`, ya existente) y anula contra el servidor. No se
   toca el dominio ni el repositorio SQLite.
2. **Anular = emitir Nota de Crédito.** `POST /ventas/:id/anular`:
   - Crea una **NC** como una `Venta` de tipo nota de crédito con la **letra
     heredada** de la factura (`FacturaB → NotaCreditoB`), por el mismo total,
     **comprobante asociado** al original (`comprobanteAsociadoId`, self-relación
     nueva) y CAE **mock** (ARCA real sigue diferido, ADR-0008).
   - Marca el original **ANULADA**.
   - **Restaura el stock**: una `ENTRADA` por cada ítem (la mercadería vuelve).
   - Todo en una transacción.
   - No se puede anular dos veces ni anular una NC.
3. **Reimpresión** desde los datos del comprobante (ítems con nombre de producto,
   total, CAE), reutilizando el recibo del POS.

## Consecuencias

### Positivas

- Anulación **fiscalmente correcta** (emite NC con comprobante asociado) y con
  efecto en stock, sin duplicar la lógica fiscal del dominio en el POS.
- Consistente con el resto de la Fase 7 (online), sin refactor del dominio/SQLite.
- El comprobante asociado deja la trazabilidad NC → factura anulada.

### Negativas / costos

- El CAE de la NC es **mock** hasta integrar ARCA real (igual que las ventas).
- La numeración de la NC la asigna el CAE mock (contador propio); con ARCA real la
  numeración vendrá del organismo.
- Duplica una pizca de lógica (la letra de la NC) respecto del dominio, pero el
  `cloud-api` es independiente de `@nexosoft/domain` por diseño.

## Alternativas consideradas

- **Comprobantes desde el dominio local** (offline-first) — descartado por ahora:
  requeriría exponer `listar()` en `RepositorioVentas` y reconstruir
  `VentaConfirmada` completas desde SQLite (frágil), rompiendo la consistencia
  "online" del resto de la fase. Se puede reevaluar si se quiere anular offline.
- **Anular borrando la venta** — descartado: fiscalmente inválido; en Argentina se
  anula con Nota de Crédito.
- **Modelar la NC en una tabla aparte** — innecesario: la NC **es** un comprobante;
  reusar `Venta` con `tipoComprobante` + `comprobanteAsociadoId` es más simple y
  hace que aparezca naturalmente en el historial y el libro de ventas.
