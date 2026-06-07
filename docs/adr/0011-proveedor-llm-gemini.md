# ADR-0011: Proveedor LLM — Google Gemini, tras interfaz

- **Estado:** Aceptada
- **Fecha:** 2026-06-07

## Contexto

Los diferenciales de IA son: **OCR de facturas de compra** (multimodal) y un
**asistente conversacional de métricas** (text-to-SQL con guardrails). Se eligió
**Google Gemini** como proveedor.

## Decisión

Definir la interfaz **`ProveedorLLM`** y un adaptador **Gemini** (Google) + un
`MockLLM`. Por defecto `gemini-2.5-flash` (multimodal, buen costo/latencia para
OCR), escalable a un modelo `pro` para razonamiento más exigente.

**Guardrails del text-to-SQL** (no negociable):
- Generación de SQL **solo lectura** (sin `INSERT/UPDATE/DELETE/DDL`).
- **Allowlist** de tablas/vistas expuestas (no acceso a credenciales/auditoría).
- Validación/parseo del SQL antes de ejecutar y límites de filas/tiempo.
- Ejecución con un rol de base de datos de **solo lectura**.

## Consecuencias

### Positivas
- Capacidad multimodal fuerte para OCR; `flash` mantiene costos bajos.
- Cambiar de proveedor (Anthropic, OpenAI) es cambiar un adaptador.

### Negativas / costos
- Sale información a un tercero: cuidar **PII** y minimizar datos enviados.
- Depende de cuota/conectividad; no testeable sin API key → `MockLLM`.

## Alternativas consideradas

- **Anthropic Claude / OpenAI** — válidas; misma interfaz, reevaluable.
- **Modelo local (open weights)** — evita enviar datos afuera, pero mayor costo
  operativo/infra; fuera del alcance del MVP.
