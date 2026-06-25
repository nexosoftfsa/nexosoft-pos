# ADR-0013: Precios IVA incluido y cálculo de comprobante

- **Estado:** Aceptada
- **Fecha:** 2026-06-25
- **Decisores:** Equipo NexoSoft

## Contexto

El cálculo de un comprobante (subtotal, descuentos, IVA y total) es lógica fiscal
sensible y debe ser **idéntica** en el POS y en el backend. Hay que decidir tres
cosas que afectan los números finales:

1. **Cómo se cargan los precios**: en el comercio minorista argentino el precio de
   góndola es **final (IVA incluido)**; en venta mayorista (Factura A) suele
   cargarse el **neto**.
2. **Cómo trata el IVA cada letra** de comprobante.
3. **Cómo se redondea** para que no aparezcan desfasajes de centavos entre las
   líneas y los totales (algo que ARCA valida en Fase 2).

## Decisión

Se implementa `calcularComprobante(líneas, opciones)` en `@nexosoft/domain` como
**única fuente de verdad** del cálculo.

- **Precios IVA incluido por defecto** (`preciosIncluyenIva: true`). Con `false`
  se interpretan como netos y el IVA se suma por encima.
- **Tratamiento por letra** (coherente con ADR-0012):
  - **A**: IVA **discriminado** (neto + IVA por alícuota).
  - **B**: IVA **incluido**, no se discrimina en el comprobante, pero **se calcula**
    internamente (débito fiscal del RI / libro IVA / ARCA en Fase 2).
  - **C** (Monotributo): **sin IVA**; el precio es el total.
- **Redondeo conciliado**: cada línea se redondea a 2 decimales y el IVA se
  descompone **por grupo de alícuota** sobre importes ya redondeados, de modo que
  siempre vale `netoGravado + iva = total` (sin diferencias de centavos).
- **Descuentos**: por línea y global (porcentaje). El IVA se descompone del importe
  **ya descontado** (el descuento reduce neto e IVA en la proporción correcta).

### Invariantes garantizadas por tests

- `netoGravado + iva = total`
- `Σ subtotalesPorAlicuota.neto = netoGravado` y `Σ …iva = iva`
- `brutoSinDescuento − descuento = Σ líneas.importe`

## Consecuencias

### Positivas

- Mismos totales en POS y backend; reglas de IVA centralizadas y testeadas.
- El caso minorista (mayoría de las ventas) es exacto y natural (precio final).
- Base lista para ARCA (Fase 2): la descomposición por alícuota es la que pide
  WSFEv1.

### Negativas / costos

- **Impuestos internos** y **recargo por forma de pago** quedan fuera de Fase 1.1
  (se calculan en POS/ARCA con su propio ADR); por ahora `impuestosInternos` es
  siempre `0,00` para no introducir un cálculo fiscal a medias.
- Hay que mantener la matriz de casos (letra × IVA incluido/neto) cubierta con
  tests ante cambios normativos.

## Alternativas consideradas

- **Cargar siempre precios netos y sumar IVA** — descartado: antinatural para el
  cajero minorista y propenso a errores de góndola.
- **Redondear solo al final (sin conciliar por línea)** — descartado: produce
  desfasajes de ±1 centavo entre el detalle y el total que ARCA rechaza.
