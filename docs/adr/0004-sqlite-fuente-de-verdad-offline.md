# ADR-0004: SQLite como fuente de verdad offline del POS

- **Estado:** Aceptada
- **Fecha:** 2026-06-07

## Contexto

El requisito no negociable es **offline-first**: vender, cobrar e imprimir sin
internet. El POS necesita una base local embebida, transaccional y confiable.

## Decisión

**SQLite** es la fuente de verdad local del POS, vía el plugin SQL de Tauri. El
backend PostgreSQL es la fuente de verdad **consolidada** multi-sucursal; la
reconciliación la maneja `@nexosoft/sync`.

## Consecuencias

### Positivas
- Embebida, transaccional (ACID), sin servicio aparte; ideal para mostrador.
- Excelente para lecturas/escrituras locales rápidas del flujo de venta.

### Negativas / costos
- **Sin tipo decimal nativo**: el dinero se guarda en enteros (centavos) o texto;
  el cálculo vive en `@nexosoft/domain` (ver ADR-0007).
- Hay dos motores (SQLite/PostgreSQL): el esquema y las migraciones deben
  mantenerse coherentes entre ambos.

## Alternativas consideradas

- **IndexedDB / almacenamiento del navegador** — sin garantías transaccionales
  equivalentes ni acceso desde la capa nativa; inadecuado para POS.
- **Sólo backend (online)** — viola el requisito offline-first.
