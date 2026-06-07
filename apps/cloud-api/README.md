# @nexosoft/cloud-api

Backend cloud multi-sucursal. Recibe la sincronización de los POS, centraliza
catálogo/precios/stock/cuentas corrientes y orquesta el servicio fiscal ARCA.

## Stack

- **NestJS** (Node + TypeScript), API tipada y modular
- **PostgreSQL** como base central (multi-sucursal)
- **Prisma** como ORM (tipo `Decimal` para dinero — ver ADR-0007)
- `@nexosoft/domain` (lógica compartida) y `@nexosoft/fiscal` (ARCA aislado)

## Prerrequisitos

- PostgreSQL 16+ (local o Docker)
- `corepack enable pnpm`
- Copiar `.env.example` → `.env` y completar `DATABASE_URL`

> El scaffold de NestJS (`src/`, `nest-cli.json`, `prisma/schema.prisma`) se
> genera al inicio de la fase correspondiente. En Fase 0 sólo queda declarado el
> paquete y sus dependencias.

## Scripts

| Comando                  | Descripción                          |
| ------------------------ | ------------------------------------ |
| `pnpm dev`               | API en modo watch                    |
| `pnpm build`             | Build de producción                  |
| `pnpm prisma:migrate`    | Migraciones de base de datos         |
| `pnpm test`              | Tests (Vitest)                       |

## Estado

🔜 Se activa en Fase 2 (ARCA) y Fase 3 (Caja/CC). El esqueleto vive desde Fase 1
para compartir tipos con el POS.
