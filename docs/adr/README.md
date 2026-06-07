# Architecture Decision Records (ADR)

Registramos las **decisiones de arquitectura** y su justificación. Un ADR es
inmutable una vez aceptado: si una decisión cambia, se crea uno nuevo que
**supersede** al anterior (no se reescribe la historia).

## Estados

`Propuesta` → `Aceptada` → (`Reemplazada por ADR-XXXX` | `Obsoleta`)

## Formato

Ver [0000-template.md](0000-template.md). Cada ADR tiene: Contexto, Decisión,
Consecuencias y Alternativas consideradas.

## Índice

| #    | Título                                                        | Estado    |
| ---- | ------------------------------------------------------------- | --------- |
| 0001 | [Registrar decisiones con ADR](0001-registro-de-decisiones-adr.md) | Aceptada |
| 0002 | [Monorepo con pnpm + Turborepo](0002-monorepo-pnpm-turborepo.md) | Aceptada |
| 0003 | [Cliente POS de escritorio con Tauri 2](0003-cliente-pos-tauri.md) | Aceptada |
| 0004 | [SQLite como fuente de verdad offline](0004-sqlite-fuente-de-verdad-offline.md) | Aceptada |
| 0005 | [Estrategia de sincronización offline-first](0005-sincronizacion-offline-first.md) | Aceptada |
| 0006 | [Backend NestJS + PostgreSQL + Prisma](0006-backend-nestjs-postgresql.md) | Aceptada |
| 0007 | [Manejo de dinero con decimales exactos](0007-manejo-de-dinero-decimal-exacto.md) | Aceptada |
| 0008 | [Servicio fiscal ARCA aislado](0008-servicio-fiscal-arca-aislado.md) | Aceptada |
| 0009 | [Abstracción de hardware con puertos y mocks](0009-abstraccion-hardware-mocks.md) | Aceptada |
| 0010 | [Pasarela de pago aislada (MercadoPago)](0010-pasarela-de-pago-mercadopago.md) | Aceptada |
| 0011 | [Proveedor LLM: Google Gemini](0011-proveedor-llm-gemini.md) | Aceptada |
| 0012 | [Condición fiscal del emisor configurable](0012-condicion-fiscal-emisor-configurable.md) | Aceptada |
