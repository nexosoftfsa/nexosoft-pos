# ADR-0006: Backend con NestJS + PostgreSQL + Prisma

- **Estado:** Aceptada
- **Fecha:** 2026-06-07

## Contexto

Necesitamos un backend modular, tipado y mantenible para consolidar datos
multi-sucursal, orquestar ARCA y exponer una API consumida por el POS y futuros
clientes (panel web). Debe manejar dinero con precisión.

## Decisión

**NestJS** (Node + TypeScript) sobre **PostgreSQL**, con **Prisma** como ORM.
Prisma aporta tipado fuerte, migraciones y el tipo **`Decimal`** (basado en
decimal.js) para dinero, coherente con ADR-0007.

## Consecuencias

### Positivas
- Arquitectura modular (módulos por dominio), DI y testabilidad.
- TypeScript end-to-end; comparte `@nexosoft/domain` con el POS.
- `NUMERIC`/`Decimal` para montos exactos; migraciones versionadas.

### Negativas / costos
- NestJS usa decoradores y `tsconfig` propio (CommonJS, `emitDecoratorMetadata`):
  difiere del `tsconfig.base.json` de bundler del resto; se aísla por paquete.
- Prisma en monorepo requiere cuidar la generación del cliente.

## Alternativas consideradas

- **Drizzle ORM** — muy TS-native y liviano; alternativa válida, pero Prisma da
  mejor DX de migraciones/`Decimal` para el MVP. Reevaluable.
- **Express/Fastify "a mano"** — menos estructura para un sistema grande.
- **TypeORM** — historial de fricciones con tipos/migraciones.
