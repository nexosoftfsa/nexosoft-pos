# ADR-0001: Registrar decisiones de arquitectura con ADR

- **Estado:** Aceptada
- **Fecha:** 2026-06-07

## Contexto

El proyecto es de largo aliento, con cumplimiento fiscal y decisiones técnicas
no triviales (offline-first, dinero exacto, ARCA). Necesitamos que las decisiones
y su **porqué** queden registradas para no repetir discusiones ni perder
contexto entre fases.

## Decisión

Usamos **Architecture Decision Records** en `docs/adr/`, numerados y versionados
en git. Una decisión aceptada no se edita: si cambia, se crea un ADR nuevo que la
reemplaza.

## Consecuencias

### Positivas
- Trazabilidad de decisiones y supuestos.
- Onboarding más rápido; el "porqué" no se pierde.

### Negativas / costos
- Disciplina de escribir el ADR cuando se toma la decisión.

## Alternativas consideradas

- **Sólo comentarios en el código / wiki externa** — se desactualiza y se
  desvincula del repo.
