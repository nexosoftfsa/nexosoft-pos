# ADR-0007: Manejo de dinero con decimales exactos

- **Estado:** Aceptada
- **Fecha:** 2026-06-07

## Contexto

Requisito no negociable: dinero exacto. Los `float`/`number` de JS (IEEE-754)
producen errores de redondeo inaceptables para IVA, impuestos internos,
descuentos, recargos, redondeo y vuelto. Además hay cálculos con porcentajes
(utilidad, alícuotas) que exigen precisión controlada.

## Decisión

- Value object **`Money`** en `@nexosoft/domain`, respaldado por **`decimal.js`**.
  Encapsula moneda (ARS), redondeo explícito (`ROUND_HALF_UP` salvo regla
  fiscal específica) y operaciones (suma, multiplicación por cantidad, % IVA).
- **Prohibido** representar dinero con `number`. Lint lo desalienta
  (`no-restricted-syntax`) y el code review lo bloquea.
- **Persistencia**: PostgreSQL `NUMERIC(18,4)`; SQLite en **enteros (centavos)**
  o texto decimal (nunca `REAL`).
- Las reglas de redondeo fiscal viven en `@nexosoft/domain` con tests exhaustivos.

## Consecuencias

### Positivas
- Exactitud y reglas de redondeo centralizadas y testeadas.
- Mismo cálculo en POS y backend (sin discrepancias de totales/IVA).

### Negativas / costos
- No se opera con aritmética nativa: hay que usar la API de `Money`.
- Pequeño overhead vs. `number` (despreciable para el caso de uso).

## Alternativas consideradas

- **`number` + redondeos manuales** — frágil; descartado por requisito.
- **dinero.js v2** — bueno, pero `Money` propio sobre `decimal.js` nos da control
  fino de redondeo fiscal y de los porcentajes de utilidad/alícuota.
- **BigInt (centavos) puro** — incómodo para porcentajes y precisión intermedia.
