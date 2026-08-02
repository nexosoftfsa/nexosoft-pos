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
| `sync`      | `POST /sync/operaciones` (ingesta de la cola de las terminales)      |
| `respaldo`  | `POST /respaldo` (crear), `GET /respaldo` (listar) — ver más abajo   |
| `asistente` | `POST /asistente/preguntar` — Asistente IA (Gemini, ver más abajo)   |
| `health`    | `GET /health` (estado + chequeo de DB)                              |

Todos los endpoints (salvo `auth` y `health`) requieren **JWT** y quedan
automáticamente acotados a la **sucursal** del token.

## Asistente IA (Google Gemini)

`POST /asistente/preguntar` responde preguntas en lenguaje natural sobre el
sistema y nociones fiscales argentinas (ARCA, Monotributo, Ingresos Brutos),
vía Gemini. La clave de API **vive solo en este servidor** (nunca en el POS
instalado) — ver [ADR-0039](../../docs/adr/0039-asistente-ia-gemini.md).

**Configuración desde la UI (recomendado, ADR-0040):** el ADMIN entra a
"Asistente IA" en el POS → "⚙ Configurar IA" y pega la clave ahí. Se guarda en
la tabla `configuracion_sistema` y no requiere reiniciar el servidor.

**Configuración por variable de entorno** (alternativa, `.env` gitignoreado —
si hay una clave cargada desde la UI, esa tiene prioridad):

```
GEMINI_API_KEY=tu-clave-de-google-ai-studio
GEMINI_MODEL=gemini-2.5-flash   # opcional; default gemini-2.5-flash
```

Conseguir una clave: https://aistudio.google.com/apikey (tiene nivel
gratuito). **Cada servidor de sucursal usa la clave de SU propio comercio** —
al instalar en un cliente, generan la suya con su cuenta de Google.

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
| `pnpm verify:e2e`        | E2E real de sync con PostgreSQL embebido (sin Docker) |
| `pnpm verify:e2e:features` | E2E real de **combos + lotes/vencimientos** contra Postgres |
| `pnpm seed:demo`         | Puebla una demo realista (almacén, combos, lotes, clientes, ventas) |
| `pnpm importar:catalogo -- --email E --password P [--archivo X] [--api URL] [--dry-run]` | Importa un catálogo (Excel) del sistema anterior de un comercio contra un servidor real, vía `/categorias`+`/productos`+`/stock/movimientos`. Idempotente por código. Ver [ADR-0042](../../docs/adr/0042-importador-de-catalogo.md). |

### Demo en vivo para mostrar al cliente

```bash
# Deja el backend corriendo en :3000 con datos de demo (Ctrl+C para terminar).
# Login: duenio@nexo.com / demo1234 (ADMIN) — apuntá el POS y el panel a :3000.
DEMO_KEEPALIVE=1 pnpm --filter @nexosoft/cloud-api seed:demo
```

## Estado (Fase 4)

- ✅ 4.1 Scaffold + auth JWT
- ✅ 4.2 Catálogo + stock
- ✅ 4.3 Capa de respaldo a nube propia
- ✅ 4.4 Ventas + libro Excel + respaldo por venta
- ✅ 4.5 Sync terminal↔servidor (cola + ingesta + `terminalId`)
- 🔜 4.6 Integración de la sync en el POS (cola SQLite, cliente HTTP, UI)

**61 tests** (cloud-api) **+ 10** (`@nexosoft/sync`), typecheck limpio, e2e verde.
