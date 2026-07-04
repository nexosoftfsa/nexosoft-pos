# ADR-0031: Presupuestos como comprobante no fiscal

- **Estado:** Aceptada
- **Fecha:** 2026-07-02
- **Decisores:** Equipo NexoSoft
- **Relacionada:** ADR-0028 (comprobantes), ADR-0025 (ABM online)

## Contexto

La Fase 7.8 suma **presupuestos** (cotizaciones): un documento **no fiscal** (sin
CAE) que el comercio arma para un cliente, con validez, y que puede terminar en
una venta o descartarse.

## Decisión

1. **Entidad propia `Presupuesto` + `ItemPresupuesto`** (no reusa `Venta`): un
   presupuesto no es una venta ni lleva CAE/stock; modelarlo aparte evita
   contaminar la numeración fiscal y el libro de ventas.
2. **Numeración correlativa por sucursal** (`max(numero)+1`), **total** calculado
   en el backend con `Decimal`, **validezDias** (default 15) y **estado**
   `VIGENTE / CONVERTIDO / ANULADO`. El "vencido" se **deriva** (VIGENTE + fecha de
   validez pasada), no es un estado persistido.
3. **Online** contra el cloud-api (`/presupuestos`), consistente con el resto de la
   Fase 7. Acciones: crear, listar, ver/imprimir, **convertir** (marca CONVERTIDO)
   y **anular**.
4. **"Convertir a venta" = marcar el estado** por ahora. Generar la venta real
   desde el presupuesto (cargar sus ítems al ticket / registrar la venta) queda
   como evolución futura, para no acoplar con el flujo de venta offline.

## Consecuencias

- El comercio puede cotizar, imprimir y hacer seguimiento (vigente/vencido/
  convertido/anulado) sin afectar lo fiscal.
- Entidad separada = numeración y libro fiscal intactos.
- "Convertir" es un marcador; la creación automática de la venta es futura.

## Alternativas consideradas

- **Reusar `Venta` con un tipo "PRESUPUESTO"** — descartado: mezcla numeración
  fiscal, CAE y stock con algo que no es una venta.
- **Vencimiento como estado persistido** — descartado: derivarlo de la fecha es
  más simple y no requiere un job que actualice estados.
