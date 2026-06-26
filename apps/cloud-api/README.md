# @nexosoft/cloud-api

Backend de NexoSoft. Centraliza catálogo, stock y ventas, y respalda los datos.
Se despliega como **servidor de sucursal en la LAN** del comercio (una PC/mini-PC)
o, opcionalmente, en la nube para multi-sucursal — el mismo binario sirve para
ambos (ver [ADR-0019](../../docs/adr/0019-topologia-servidor-de-sucursal-lan.md)).

## Stack

- **NestJS** (Node + TypeScript), API tipada y modular
- **PostgreSQL** como base de la sucursal (multi-sucursal desde el schema)
- **Prisma** como ORM (tipo `Decimal` para dinero — ver ADR-0007)
- `@nexosoft/domain` (lógica compartida) y `@nexosoft/fiscal` (ARCA aislado)

## Topología

```
   SUCURSAL (LAN)
   ┌───────────────────────────────┐
   │ PC Servidor                   │
   │  • cloud-api (este paquete)   │
   │  • PostgreSQL                 │
   │  • Respaldo → nube propia     │
   └──────▲──────────▲─────────────┘
          │ HTTP/LAN │
      ┌───┴──┐   ┌───┴──┐
      │ Caja │   │ Caja │  ← POS offline-first (SQLite local)
      └──────┘   └──────┘
```

Las cajas son **offline-first**: venden aunque el servidor esté caído y
sincronizan al recuperar la red (Fase 4.5).

## Módulos

| Módulo      | Endpoints (prefijo `/api/v1`)                                        |
| ----------- | ------------------------------------------------------------------- |
| `auth`      | `POST /auth/register · /auth/login · /auth/refresh · /auth/logout`   |
| `catalogo`  | `GET/POST /categorias`, `GET/POST/PATCH/DELETE /productos`           |
| `stock`     | `GET /stock`, `GET /stock/:id`, `POST /stock/movimientos`            |
| `ventas`    | `POST /ventas` (registrar, idempotente), `GET /ventas` (historial)   |
| `respaldo`  | `POST /respaldo` (crear), `GET /respaldo` (listar) — ver más abajo   |
| `health`    | `GET /health` (estado + chequeo de DB)                              |

Todos los endpoints (salvo `auth` y `health`) requieren **JWT** y quedan
automáticamente acotados a la **sucursal** del token.

## Respaldo en nube propia

El servidor genera snapshots consistentes de la base y los deja en una **carpeta
configurable** (`RESPALDO_RUTA`). Si esa carpeta es la de Google Drive / OneDrive
Desktop, la nube los sube sola — **sin integrar ninguna API**. También sirve para
disco externo o NAS. Detalle de diseño en
[`src/respaldo/README.md`](src/respaldo/README.md) y
[ADR-0020](../../docs/adr/0020-respaldo-en-nube-propia.md).

## Libro de ventas (Excel) y respaldo por venta

En **cada venta** se actualiza un **Excel** (`RESPALDO_RUTA/ventas.xlsx`, una fila
por venta) para control del dueño — viaja a la nube propia junto a los snapshots.
Opcionalmente, con `RESPALDO_EN_CADA_VENTA=true`, se genera además un snapshot
completo tras cada venta (default `false`: en alto volumen es caro). Ver
[ADR-0021](../../docs/adr/0021-libro-de-ventas-excel-y-respaldo-en-venta.md).

## Prerrequisitos

- PostgreSQL 16+ (en la PC servidor)
- `corepack enable pnpm`
- Copiar `.env.example` → `.env` y completar `DATABASE_URL`, `JWT_SECRET`,
  `JWT_REFRESH_SECRET` y, si se quiere respaldo automático, `RESPALDO_*`

## Scripts

| Comando                  | Descripción                          |
| ------------------------ | ------------------------------------ |
| `pnpm dev`               | API en modo watch                    |
| `pnpm build`             | Build de producción                  |
| `pnpm prisma:generate`   | Genera el cliente Prisma             |
| `pnpm prisma:migrate`    | Migraciones de base de datos         |
| `pnpm typecheck`         | Chequeo de tipos                     |
| `pnpm test`              | Tests (Vitest)                       |

## Estado (Fase 4)

- ✅ 4.1 Scaffold + auth JWT
- ✅ 4.2 Catálogo + stock
- ✅ 4.3 Capa de respaldo a nube propia
- ✅ 4.4 Ventas + libro Excel + respaldo por venta
- 🔜 4.5 Sync terminal↔servidor · 4.6 Config en el POS

**53 tests verdes**, typecheck limpio.
