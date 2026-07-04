# ADR-0032: Remitos como documento de entrega no fiscal

- **Estado:** Aceptada
- **Fecha:** 2026-07-02
- **Decisores:** Equipo NexoSoft
- **Relacionada:** ADR-0031 (presupuestos)

## Contexto

La Fase 7.8 suma **remitos**: documento de **entrega** (no fiscal, sin CAE ni
precios) que acompaña la mercadería. Estructuralmente similar al presupuesto pero
sin importes.

## Decisión

1. **Entidad propia `Remito` + `ItemRemito`** (mismo criterio que presupuestos,
   ADR-0031): número correlativo por sucursal, estado `EMITIDO / ANULADO`, ítems
   con **descripción + cantidad, sin precio** (un remito documenta qué se entrega,
   no cuánto cuesta).
2. **Online** contra el cloud-api (`/remitos`). Acciones: crear, listar,
   ver/imprimir, anular.
3. **No mueve stock** en esta fase (documento nomás). La descarga de stock al
   entregar queda como evolución futura.

## Consecuencias

- El comercio puede emitir e imprimir remitos y anularlos, sin afectar lo fiscal
  ni el stock.
- Reusa el patrón de presupuestos (módulo, simulado, pantalla), rápido y coherente.

## Alternativas consideradas

- **Remito con precios/total** — descartado: el remito es de entrega; los precios
  van en la factura. Mantenerlo sin importes lo diferencia del presupuesto.
- **Descontar stock al emitir** — diferido: sumaría acople con stock; por ahora es
  un documento. Se puede agregar cuando se quiera el circuito remito→stock.
