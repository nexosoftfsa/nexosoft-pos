# ONBOARDING — NexoSoft

Guía para un segundo desarrollador que se suma al proyecto desde otra
computadora. Cubre qué es el sistema, cómo está armado, cómo correrlo y qué
hay que saber para no romper nada. Está escrita a partir de los archivos
reales del repo (no es un resumen de memoria).

> **Lectura obligatoria además de esto:** [`CLAUDE.md`](CLAUDE.md) (convenciones
> de trabajo del equipo) y [`docs/arquitectura.md`](docs/arquitectura.md) +
> [`docs/adr/`](docs/adr/) (41 decisiones de arquitectura documentadas, con el
> porqué de cada una). Este documento no las repite, las referencia.

---

## 1. Qué es el sistema

**NexoSoft** es un sistema de **ventas y gestión comercial (POS)** para un
comercio mediano argentino. Es **offline-first**: vender, cobrar e imprimir
el ticket funciona sin conexión a internet; la parte que sí necesita red
(pedir el CAE a ARCA, sincronizar entre cajas) se resuelve en segundo plano
cuando hay conexión.

La topología clave (no es un SaaS centralizado): **cada comercio tiene su
propio servidor** corriendo en una PC/mini-PC de su local (`cloud-api` +
PostgreSQL). Las cajas (`pos-desktop`, instalado en cada terminal) hablan con
ese servidor por la red local, y cada caja además guarda sus propios datos en
SQLite local para poder seguir vendiendo si el servidor o internet se caen.
Ver [ADR-0019](docs/adr/0019-topologia-servidor-de-sucursal-lan.md).

### Qué ya está hecho y funciona (Fases 1–9, ver tabla completa en `README.md`)

- **Dominio de negocio compartido** (dinero exacto sin `float`, IVA, cálculo
  de comprobantes) en `@nexosoft/domain`, usado tanto por el POS como por el
  backend.
- **POS de escritorio instalable** (Tauri + React, Windows, instalador NSIS),
  offline-first de verdad: catálogo, venta, cobro, impresión de ticket.
- **Backend NestJS + PostgreSQL** con: autenticación JWT + RBAC (roles
  Administrador/Supervisor/Cajero), catálogo, stock, ventas, sincronización
  desde las cajas, respaldo a la nube propia del cliente (Drive/OneDrive/NAS,
  sin integrar ninguna API), libro de ventas en Excel actualizado en cada
  venta.
- **Gestión completa dentro del POS**: catálogo (ABM), stock (con lotes y
  vencimientos, alertas, FEFO), caja y tesorería (turnos, arqueo), cuentas
  corrientes (clientes, fiado), comprobantes y anulaciones (emiten Nota de
  Crédito), presupuestos (convertibles a venta real), remitos (mueven
  stock), combos (producto compuesto que descuenta stock de sus
  componentes), promociones (2x1, %), recargos, pago combinado (varios
  medios en una venta).
- **Panel web de reportes** (`apps/admin-web`), solo lectura, para el dueño:
  dashboard de ventas, top productos, stock bajo, export CSV/Excel.
- **Asistente de IA** dentro del POS: preguntas de datos exactos (ventas,
  stock, vencimientos, deudores) las responde un motor local; preguntas
  generales o fiscales se derivan a **Google Gemini real**, con la clave de
  API configurable desde la propia interfaz (sin tocar archivos del
  servidor).
- **Modo demo autocontenido**: la app instalada puede correr sin servidor
  (todo en memoria) para mostrarla sin depender de infraestructura.

### Qué está a medias (mock funcional, falta la integración real)

Estas partes están **aisladas detrás de una interfaz**, con una implementación
simulada que ya cumple todas las reglas de negocio, pero la conexión real al
proveedor externo todavía no está hecha:

- **Facturación fiscal ARCA (ex AFIP)**: `MockServicioFiscal` cubre todo el
  flujo (numeración, CAE, reglas por tipo de comprobante). La implementación
  real (`ArcaServicioFiscal`, WSAA + WSFEv1) está **documentada pero no
  implementada** — necesita certificado X.509 + CUIT habilitado del cliente
  real. Es el pendiente más importante para poder facturar legalmente.
- **Cobro electrónico con MercadoPago**: `MockPasarelaDePago` funciona
  completo; `MercadoPagoPoint` es un esqueleto que **lanza error** hasta que
  se instale el SDK y se carguen credenciales reales.
- **Hardware físico** (impresora térmica ESC/POS, lector de código de barras,
  balanza): los **mocks** son la única implementación disponible hoy. Los
  adaptadores reales (USB/serial desde la capa nativa de Tauri) se
  implementan sin tocar el resto del sistema, pero **no están hechos**
  todavía — quedan para cuando se defina el hardware concreto del primer
  cliente.
- **`@nexosoft/ui`**: paquete de componentes UI compartidos, existe pero está
  prácticamente vacío (sin lógica propia real todavía).

### Qué falta (no empezado)

- **Sistema de licencias/suscripciones** y **actualizaciones centralizadas**
  del instalador: decidido en conversación reciente con el equipo, todavía
  sin una línea de código. Es el próximo bloque de trabajo grande.
- Deploy en la nube (Railway) para el caso opcional de multi-sucursal.
- Multi-sucursal real a nivel cloud (el modelo de datos ya tiene
  `sucursalId` en todo, pero el flujo de "una empresa con varios locales" no
  está armado end-to-end).

---

## 2. Stack técnico

Monorepo con **pnpm workspaces** (`pnpm-workspace.yaml`: `apps/*` y
`packages/*`) orquestado con **Turborepo**. TypeScript en modo estricto en
todo el código TS/React. Versiones verificadas en esta máquina:

| Herramienta | Versión usada | Dónde se define |
| --- | --- | --- |
| Node.js | ≥ 22 (probado con 24) | `package.json` → `engines.node` |
| pnpm | 9.15.4, vía `corepack` | `package.json` → `packageManager` |
| TypeScript | 5.7.x | cada `package.json` |
| Turborepo | 2.3.x | `package.json` raíz |
| Rust / Cargo | estable, 1.96 (mínimo declarado 1.77.2) | `apps/pos-desktop/src-tauri/Cargo.toml` |
| Tauri | 2.11.3 (CLI 2.1.0) | `Cargo.toml` / `package.json` de pos-desktop |
| React | 18.3.x | pos-desktop y admin-web |
| Vite | 6.x | pos-desktop y admin-web |
| NestJS | 10.4.x | cloud-api |
| Prisma | 6.1.x | cloud-api |
| PostgreSQL | ≥ 16 | servidor de sucursal (cloud-api) |

### Dependencias principales del frontend (por paquete)

**`apps/pos-desktop`** (cliente de escritorio):
- `react` / `react-dom` — UI.
- `@tauri-apps/api` — puente JS↔Rust del shell nativo.
- `@tauri-apps/plugin-sql` — acceso a SQLite desde el frontend (vía Rust).
- `@nexosoft/domain`, `@nexosoft/app`, `@nexosoft/fiscal`, `@nexosoft/hardware`,
  `@nexosoft/pagos`, `@nexosoft/sync`, `@nexosoft/ui` — los paquetes propios
  del monorepo (`workspace:*`).
- Dev: `vite` + `@vitejs/plugin-react` (bundler), `vitest` (tests),
  `@tauri-apps/cli` (compilar el instalador).

**`apps/admin-web`** (panel de reportes):
- `react-router-dom` — ruteo del panel.
- `recharts` — gráficos del dashboard.

**`apps/cloud-api`** (backend):
- `@nestjs/*` (common, core, config, jwt, passport, platform-express,
  schedule, serve-static) — framework del backend, auth JWT, cron de
  respaldo, y servir el panel web estático desde el mismo backend.
- `@prisma/client` + `prisma` — ORM contra PostgreSQL.
- `argon2` — hash de contraseñas.
- `class-validator` / `class-transformer` — validación de DTOs de entrada.
- `exceljs` — generación del libro de ventas en Excel.
- `cron` — tareas programadas (respaldo automático).
- `date-fns` — manejo de fechas (huso horario Argentina en reportes).
- Dev: `embedded-postgres` — levanta un PostgreSQL portable **sin Docker**
  para los tests e2e; `pg-mem` — Postgres en memoria para algunos tests.

**Paquetes compartidos** (`packages/*`, todos TypeScript puro, sin runtime
propio salvo lo declarado):
- `domain` — dinero (`decimal.js`), IVA, comprobantes. Sin dependencias de
  infraestructura: lo usan tanto el POS como el backend.
- `app` — casos de uso (armar/confirmar venta) y los "puertos" (interfaces)
  de persistencia que implementan los adaptadores concretos.
- `fiscal` — integración ARCA aislada (mock + esqueleto real).
- `pagos` — pasarela de pago aislada (mock + esqueleto MercadoPago).
- `hardware` — impresora/lector/balanza aislados (mocks).
- `sync` — cola de sincronización offline-first (outbox pattern).
- `ui` — componentes compartidos (hoy casi vacío).

### Backend nativo (Rust / Tauri) — `src-tauri`

Esto **no es "el backend"** del sistema (eso es `cloud-api`, en Node/NestJS).
Es la capa nativa mínima que le da al POS acceso a SQLite y a funciones del
sistema operativo que un navegador no tiene. Dependencias (`Cargo.toml`):

- `tauri` (2.11.3) — el framework en sí (ventana nativa, IPC con el JS).
- `tauri-plugin-sql` (features `sqlite`) — SQLite embebido, la fuente de
  verdad offline del POS.
- `tauri-plugin-log` — logging nativo.
- `serde` / `serde_json` — (de)serialización entre Rust y JS.

---

## 3. Estructura del proyecto

```
.
├── CLAUDE.md                # Convenciones de trabajo — LEER PRIMERO
├── README.md                # Resumen del proyecto y roadmap de fases
├── ONBOARDING.md            # Este documento
├── .env.example              # Plantilla de variables de entorno (sin valores reales)
├── package.json              # Scripts raíz (turbo run build/dev/test/lint/typecheck)
├── pnpm-workspace.yaml       # Declara los workspaces: apps/* y packages/*
│
├── apps/
│   ├── pos-desktop/          # Cliente POS de escritorio (lo que corre en cada caja)
│   │   ├── src/               # Frontend (React + TS)
│   │   │   ├── componentes/    # Pantallas: Ventas, Catálogo, Stock, Caja, CtaCte,
│   │   │   │                   #   Comprobantes, Presupuestos, Remitos, Reportes,
│   │   │   │                   #   AsistenteIA, Inicio, Login, Config…
│   │   │   ├── datos/          # Acceso a SQLite local (EjecutorSql, bootstrap)
│   │   │   ├── shell/          # Layout general (menú lateral, gating por rol/módulo)
│   │   │   └── sync/           # Clientes HTTP hacia cloud-api + cola de sync
│   │   ├── src-tauri/          # Backend NATIVO (Rust) — shell de la app instalada
│   │   │   ├── src/main.rs      # Punto de entrada Tauri
│   │   │   ├── Cargo.toml       # Dependencias Rust
│   │   │   ├── tauri.conf.json  # Config de la app (ventana, bundling del instalador)
│   │   │   └── capabilities/    # Permisos que el frontend tiene habilitados (ACL)
│   │   └── package.json
│   │
│   ├── cloud-api/             # Backend (servidor de sucursal). NestJS + PostgreSQL
│   │   ├── src/
│   │   │   ├── auth/            # Login JWT + refresh + RBAC
│   │   │   ├── catalogo/        # Productos, categorías, combos
│   │   │   ├── stock/           # Movimientos, saldos, lotes/vencimientos (FEFO)
│   │   │   ├── ventas/          # Registrar venta, anular (emite NC), libro Excel
│   │   │   ├── caja/            # Turnos, arqueo, movimientos de caja
│   │   │   ├── clientes/        # Cuentas corrientes (fiado)
│   │   │   ├── presupuestos/    # Comprobante no fiscal, convertible a venta
│   │   │   ├── remitos/         # Comprobante no fiscal, mueve stock
│   │   │   ├── reportes/        # Endpoints para el panel web
│   │   │   ├── respaldo/        # Snapshots a la nube propia del cliente
│   │   │   ├── sync/            # Ingesta de operaciones desde las cajas
│   │   │   ├── terminales/      # Altas/listado de cajas de la sucursal
│   │   │   ├── asistente/       # Asistente IA (Gemini) + su configuración
│   │   │   ├── health/          # Endpoint de salud
│   │   │   └── prisma/          # Servicio de acceso a Prisma
│   │   ├── prisma/schema.prisma # Esquema de la base PostgreSQL (ver sección 4)
│   │   └── test/                # Scripts de e2e real y de seed de demo
│   │
│   └── admin-web/             # Panel web de reportes, solo lectura, para el dueño
│       └── src/
│
├── packages/                  # Código compartido (ver sección 2)
│   ├── domain/  ├── app/  ├── fiscal/  ├── hardware/  ├── pagos/  ├── sync/  └── ui/
│
├── docs/
│   ├── arquitectura.md        # Visión general de arquitectura y modelo conceptual
│   ├── roadmap-fase-7-gestion.md
│   └── adr/                   # 41 Architecture Decision Records numerados (0001–0040)
│                               #   + README.md con el índice
│
└── prototipo/                 # Maqueta HTML estática vieja (solo referencia visual,
                                #   sin lógica real — no es parte del sistema en producción)
```

### Archivos/módulos más importantes para entender el sistema rápido

| Archivo | Por qué importa |
| --- | --- |
| `packages/domain/src/` | Reglas de negocio puras (dinero, IVA, comprobantes). Todo lo demás depende de esto. |
| `apps/cloud-api/prisma/schema.prisma` | La verdad sobre qué datos existen y cómo se relacionan (servidor). |
| `packages/app/sql/esquema-sqlite.sql` | La verdad sobre los datos en cada caja (local, offline). |
| `apps/pos-desktop/src/shell/modulos.tsx` | Qué módulos ve cada rol en el menú — el punto de extensión natural para gating (p. ej. por plan de suscripción, más adelante). |
| `apps/pos-desktop/src/App.tsx` | Arranca la app, decide si corre en Tauri o en navegador, maneja login/sesión/config. |
| `apps/pos-desktop/src-tauri/capabilities/default.json` | Qué puede hacer el frontend contra SQLite (si falta un permiso acá, las queries fallan en silencio raro — ver sección 8). |
| `CLAUDE.md` | Las reglas no negociables del proyecto. |
| `docs/adr/README.md` | Índice de las 41 decisiones de arquitectura documentadas. |

---

## 4. Base de datos y datos

Hay **dos bases de datos distintas**, a propósito (offline-first):

### 4.1 PostgreSQL (servidor de sucursal — `apps/cloud-api`)

- Motor: **PostgreSQL 16+**, corriendo en la PC servidor del comercio (o en
  local para desarrollo).
- ORM: **Prisma** (`apps/cloud-api/prisma/schema.prisma`).
- **No hay migraciones formales todavía** (no existe carpeta
  `prisma/migrations`): el flujo actual es `prisma db push` (aplica el
  schema directo) más que `prisma migrate`. El script `prisma:migrate`
  existe en `package.json` pero en la práctica no se usó — es algo a definir
  con el equipo antes de tener datos reales de un cliente en producción.
- Seeds: no hay un seed "de producción"; `apps/cloud-api/test/seed-demo.mjs`
  genera datos de **demo** (para mostrar el sistema), y `test/e2e-sync.mjs` /
  `test/e2e-combos-lotes.mjs` son scripts de **e2e real** que levantan un
  PostgreSQL embebido (sin Docker) para probar contra una base de verdad.

**Modelos principales** (nombre de tabla real entre paréntesis, ver
`schema.prisma` para todos los campos):

| Modelo | Tabla | Qué guarda |
| --- | --- | --- |
| `Sucursal` | `sucursales` | El comercio/local. Todo lo demás cuelga de acá. |
| `Terminal` | `terminales` | Cada caja física de la sucursal. |
| `Usuario` / `RefreshToken` | `usuarios` / `refresh_tokens` | Login, rol (ADMIN/CAJERO/SUPERVISOR), tokens JWT. |
| `Categoria` / `Producto` / `ComboComponente` | `categorias` / `productos` / `combo_componentes` | Catálogo. `Producto.tipo` puede ser SIMPLE o COMBO. |
| `MovimientoStock` / `Lote` | `movimientos_stock` / `lotes` | Entradas/salidas de stock; lotes con vencimiento (FEFO) para perecederos. |
| `Venta` / `Pago` / `ItemVenta` | `ventas` / `pagos` / `items_venta` | La venta, su desglose de pagos (pago combinado) y sus ítems. `medioPago` incluye EFECTIVO/TARJETA_DEBITO/TARJETA_CREDITO/MERCADOPAGO_QR/TRANSFERENCIA/CUENTA_CORRIENTE/COMBINADO. |
| `TurnoCaja` / `MovimientoCaja` | `turnos_caja` / `movimientos_caja` | Apertura/cierre de caja, arqueo, ingresos/egresos de efectivo. |
| `Cliente` / `MovimientoCuentaCorriente` | `clientes` / `movimientos_cuenta_corriente` | Cuenta corriente (fiado): CARGO (deuda) / PAGO (cobro). |
| `Presupuesto` / `ItemPresupuesto` | `presupuestos` / `items_presupuesto` | Comprobante no fiscal, convertible a venta real. |
| `Remito` / `ItemRemito` | `remitos` / `items_remito` | Comprobante no fiscal, mueve stock (entrega sin precios). |
| `ConfiguracionSistema` | `configuracion_sistema` | Fila única: clave de Gemini cargada desde la UI (tiene prioridad sobre la variable de entorno). |

Todas las tablas de negocio llevan `sucursalId` (multi-sucursal desde el
diseño, aunque hoy en la práctica cada servidor atiende una sola sucursal).

### 4.2 SQLite (local, en cada caja — `apps/pos-desktop`)

- Es la **fuente de verdad offline**: el POS vende contra esto, no contra la
  red. Definido en `packages/app/sql/esquema-sqlite.sql`.
- Convenciones estrictas (ver `CLAUDE.md`): dinero en **enteros (centavos)**,
  nunca `REAL`; cantidades como texto decimal; fechas ISO-8601.
- Tablas: `comercio_config`, `articulo`, `lista_precios`, `precio_articulo`,
  `deposito`, `existencia`, `movimiento_stock`, `lote`, `combo_componente`,
  `venta`, `item_venta`, `pago` — más `ajuste` y `sesion` (creadas por
  `apps/pos-desktop/src/datos/ajustes-sqlite.ts` y `sesion-sqlite.ts`, para
  configuración de la terminal y la sesión de login persistida).
- Vive dentro de la carpeta de datos de la app instalada (gestionada por
  `@tauri-apps/plugin-sql`), no es un archivo que se edite a mano.

---

## 5. Configuración y secretos

### 5.1 Variables de entorno

El backend (`apps/cloud-api`) lee su configuración de un archivo `.env` en
`apps/cloud-api/.env` (**no versionado**, ver `.gitignore`). Hay una
plantilla en `.env.example` (raíz del repo) con todos los nombres.
**Acá solo se listan los nombres y para qué sirven — ningún valor real.**

| Variable | Para qué sirve |
| --- | --- |
| `NODE_ENV` | Entorno de ejecución (`development` / `production`). |
| `PORT` | Puerto donde escucha el backend (el código lee `PORT`; el `.env.example` documenta `API_PORT` — **inconsistencia real a corregir**, ver sección 8). Default 3000 si no está seteada. |
| `DATABASE_URL` | Cadena de conexión a PostgreSQL (usuario, clave, host, puerto, nombre de base). |
| `JWT_SECRET` | Firma del access token JWT. Obligatoria (el código usa `getOrThrow`, sin esto el backend no arranca). |
| `JWT_ACCESS_EXPIRY` | Vigencia del access token (default 15m si no está). |
| `JWT_REFRESH_SECRET` | Firma del refresh token. Obligatoria. |
| `JWT_REFRESH_EXPIRY` / `JWT_REFRESH_DAYS` | Vigencia del refresh token. |
| `ARCA_ENV` | `homologacion` o `produccion` — hoy no se usa (ARCA real no está implementado), queda preparada para cuando se conecte. |
| `ARCA_CUIT`, `ARCA_CERT_PATH`, `ARCA_KEY_PATH`, `ARCA_KEY_PASSPHRASE` | Datos del certificado fiscal del comercio. Sin uso real todavía (mock activo). |
| `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL` | Documentadas en el ejemplo pero el código real usa `GEMINI_API_KEY`/`GEMINI_MODEL` directamente (ver siguiente fila) — otra inconsistencia menor entre la plantilla y el código. |
| `GEMINI_API_KEY` | Clave de Google Gemini para el Asistente IA. **Si hay una clave cargada desde la pantalla de Configuración del POS (guardada en `configuracion_sistema`), esa tiene prioridad** — esta variable es el respaldo. |
| `GEMINI_MODEL` | Modelo de Gemini a usar (default `gemini-2.5-flash`; ver nota en el código sobre `gemini-2.0-flash` dando error de cuota en el free tier). |
| `PAGOS_PROVIDER`, `MP_ENV`, `MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY` | Credenciales de MercadoPago. Sin uso real todavía (mock activo, `MercadoPagoPoint` lanza error si se intenta usar sin esto). |
| `SYNC_BACKEND` | Documentada pero informativa — la sincronización real usa la implementación propia (`@nexosoft/sync`), no un backend externo. |
| `RESPALDO_RUTA` | Carpeta donde se escriben los snapshots de respaldo (puede ser la carpeta local de Google Drive/OneDrive — así sube solo, sin integrar ninguna API). |
| `RESPALDO_RETENER` | Cuántos respaldos viejos conservar antes de borrar los más antiguos. |
| `RESPALDO_CRON` | Expresión cron para respaldo automático (vacío = solo manual / al cerrar caja). |
| `RESPALDO_EN_CADA_VENTA` | Si `true`, genera un snapshot completo después de cada venta (default `false`, caro en alto volumen). |
| `LIBRO_VENTAS_ARCHIVO` | Ruta del Excel de ventas (default `RESPALDO_RUTA/ventas.xlsx`). |
| `CORS_ORIGINS` | Fase 15.B: lista de orígenes permitidos por CORS, separados por coma. Vacía/sin definir = CORS abierto a cualquier origen (correcto en LAN, ADR-0019). Definila con el dominio del túnel antes de exponer `admin-web`/el login a internet — ver ADR-0052. |

**`apps/pos-desktop` (el POS instalado) no usa variables de entorno de
build.** Su configuración (URL del servidor, datos fiscales del comercio) se
carga en tiempo de ejecución desde SQLite local y se edita desde la propia
pantalla "Configuración" de la app — no hay nada que compilar distinto por
cliente.

**`apps/admin-web`** usa una sola variable, `VITE_API_URL` (URL base del
backend al que apunta el panel; tiene un default a `localhost:3000/api/v1`
si no está seteada).

### 5.2 Estado real de esta máquina

Ya existe un `apps/cloud-api/.env` local con `GEMINI_API_KEY` cargada (no
está trackeado por git, confirmado). Para correr el proyecto en otra
computadora hay que crear ese archivo de nuevo a partir de `.env.example` —
no se copia entre máquinas.

### 5.3 Integraciones externas — resumen de cómo están hoy

| Integración | Estado | Dónde vive |
| --- | --- | --- |
| **ARCA / CAE** (facturación fiscal) | Mock funcional completo; real sin implementar (falta certificado del cliente) | `packages/fiscal` |
| **MercadoPago** (Point/QR) | Mock funcional completo; real sin implementar (falta SDK + credenciales) | `packages/pagos` |
| **Google Gemini** (asistente IA) | **Real y funcional**, clave configurable desde la UI | `apps/cloud-api/src/asistente` + `packages` no aplica (vive solo en el backend) |
| **Impresora ESC/POS, lector de barras, balanza** | Solo mocks; hardware real sin implementar | `packages/hardware` |

Todas siguen el mismo patrón (ver `CLAUDE.md` §6): interfaz (puerto) + mock
funcional con tests, para poder desarrollar y probar sin la integración real.

---

## 6. Cómo correrlo

### 6.1 Requisitos previos

| Herramienta | Necesario para | Notas |
| --- | --- | --- |
| Node.js ≥ 22 | Todo | Esta máquina tiene 24.16.0 |
| pnpm 9.x vía `corepack` | Todo | `corepack enable pnpm` |
| Rust estable + Cargo | Compilar/correr el POS nativo (Tauri) | Esta máquina tiene 1.96.0 |
| WebView2 + Build Tools de Visual Studio (C++) | Tauri en Windows | Sin esto, `tauri dev`/`tauri build` fallan |
| PostgreSQL ≥ 16 | Correr el backend contra una base real | Para tests/e2e no hace falta instalarlo: se usa `embedded-postgres` (portable, sin Docker) |

### 6.2 Instalación

```powershell
# 1. Clonar el repo y pararse en la raíz
corepack enable pnpm
pnpm install

# 2. Configurar el backend
Copy-Item .env.example apps\cloud-api\.env
# Editar apps\cloud-api\.env: como mínimo DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET

# 3. Tener un PostgreSQL corriendo y aplicarle el schema
corepack pnpm --filter @nexosoft/cloud-api prisma:generate
# (crear la base indicada en DATABASE_URL, luego aplicar el schema)
corepack pnpm --filter @nexosoft/cloud-api exec prisma db push
```

### 6.3 Desarrollo

```powershell
# Backend (NestJS, modo watch)
corepack pnpm --filter @nexosoft/cloud-api dev

# POS en el navegador (sin Tauri: datos en memoria, "modo demo" autocontenido)
corepack pnpm --filter @nexosoft/pos-desktop dev

# POS como app de escritorio real (Tauri, requiere Rust/WebView2 instalados)
corepack pnpm --filter @nexosoft/pos-desktop tauri:dev

# Panel de reportes
corepack pnpm --filter @nexosoft/admin-web dev
```

Atajo para levantar un backend con datos de demo realistas ya cargados
(útil para probar sin armar datos a mano):

```powershell
$env:DEMO_KEEPALIVE=1
corepack pnpm --filter @nexosoft/cloud-api seed:demo
# Backend en :3000, login duenio@nexo.com / demo1234
```

### 6.4 Build de producción

```powershell
# Instalador nativo del POS (Windows, NSIS) — el resultado queda en
# apps/pos-desktop/src-tauri/target/release/bundle/nsis/
corepack pnpm --filter @nexosoft/pos-desktop tauri:build

# Backend (compila a dist/, se corre con `pnpm start`)
corepack pnpm --filter @nexosoft/cloud-api build

# Panel de reportes (build estático, se puede servir desde el propio backend)
corepack pnpm --filter @nexosoft/admin-web build
```

### 6.5 Tests, lint, typecheck

```powershell
# Todo el monorepo (turbo)
pnpm test
pnpm lint
pnpm typecheck

# Un paquete puntual (más rápido, y necesario porque algunos stubs sin tests
# hacen fallar `pnpm -r test`)
corepack pnpm --filter @nexosoft/domain --filter @nexosoft/app --filter @nexosoft/fiscal `
  --filter @nexosoft/hardware --filter @nexosoft/pagos --filter @nexosoft/sync `
  --filter @nexosoft/cloud-api --filter @nexosoft/pos-desktop test

# E2E real contra PostgreSQL (embebido, sin Docker)
corepack pnpm --filter @nexosoft/cloud-api verify:e2e
corepack pnpm --filter @nexosoft/cloud-api verify:e2e:features   # combos + lotes
```

---

## 7. Estado para trabajar en equipo (Git)

### 7.1 Estado actual (verificado ahora mismo)

- **Ya es un repositorio Git.** Rama `main`, **92 commits**, historial
  limpio con Conventional Commits.
- **No tiene ningún remoto configurado** (`git remote -v` no devuelve nada)
  — nunca se subió a GitHub ni a ningún otro lado. Vive solo en esta
  computadora.
- **Estado actual:** limpio, salvo `packages/domain/demo/` (una carpeta sin
  trackear a propósito — es un script de demo que depende de un build local
  y no se versiona).
- **El `.gitignore` ya existe y está bien armado** (no hizo falta crearlo).
  Verificado explícitamente: ningún archivo `.env` está trackeado por git,
  a pesar de que existen `.env.example` (sí trackeado, es la plantilla sin
  secretos) y `apps/cloud-api/.env` (real, con la clave de Gemini —
  confirmado que NO está en el repo).

### 7.2 Qué queda incluido y qué queda excluido

El `.gitignore` actual excluye (entre otras cosas):

- `node_modules/`, `.pnpm-store/`, `.turbo/` — dependencias y caché.
- `dist/`, `build/`, `out/`, `*.tsbuildinfo` — builds de TypeScript/Vite.
- `target/`, `apps/pos-desktop/src-tauri/target/`,
  `apps/pos-desktop/src-tauri/gen/` — build de Rust/Tauri (pesado, se
  regenera al compilar).
- `.env`, `.env.*` (excepto `.env.example`), `*.pem`, `*.key`, `*.crt`,
  `*.cer`, `*.pfx`, `*.p12`, `/secrets/`, `/certs/` — **todo lo que sea
  secreto o certificado**.
- `*.sqlite`, `*.sqlite3`, `*.db*` — bases de datos locales generadas.
- `respaldos/`, `*.json.gz` — respaldos generados en runtime.
- `*.log`, `logs/`, `coverage/` — logs y cobertura de tests.
- `.DS_Store`, `Thumbs.db`, `.idea/`, `.vscode/*` (salvo
  `extensions.json`/`settings.json`) — archivos de editor/SO.

Con esa configuración, **quedan incluidos** (es lo que se sube):
- Todo el código fuente (`apps/*/src`, `packages/*/src`, `apps/*/src-tauri/src`).
- Los `package.json`, `Cargo.toml`, `tsconfig*.json`, `tauri.conf.json`,
  configs de ESLint/Prettier/Vitest.
- `prisma/schema.prisma` (el esquema, sin datos).
- `docs/` completo (arquitectura, los 41 ADRs).
- `.env.example` (plantilla sin valores reales) y `.gitignore`.
- Los `README.md` de cada paquete/app y `CLAUDE.md`.

No hace falta ningún cambio al `.gitignore` para este paso — ya cubre lo
sensible correctamente.

### 7.3 Paso a paso: crear el repo privado en GitHub y subir por primera vez

Como el repo local **ya existe** (con 92 commits), esto es agregar un
remoto y hacer el primer push — no un `git init` desde cero.

**1. Crear el repositorio vacío en GitHub** (sin README, sin .gitignore, sin
licencia — ya los tenemos localmente, para no generar conflictos):

- Opción A (web): entrar a github.com → "New repository" → nombre
  `nexosoft` (o el que prefieran) → marcar **Private** → **no** tildar
  "Add a README file" → Create repository.
- Opción B (con [GitHub CLI](https://cli.github.com/) instalado y logueado):
  ```powershell
  gh repo create nexosoft --private --source=. --remote=origin
  ```
  (esto ya deja el remoto configurado, se puede saltar el paso 2).

**2. Si se creó por la web, conectar el repo local con el remoto** (GitHub
te muestra esta URL exacta al crear el repo; reemplazá `TU-USUARIO`):

```powershell
Set-Location "C:\Users\rodri\Proyecto 1 - NexoSoft"
git remote add origin https://github.com/TU-USUARIO/nexosoft.git
```

**3. Subir todo por primera vez:**

```powershell
git push -u origin main
```

**4. Para que tu socio pueda trabajar sobre el mismo código**, invitarlo
como colaborador del repo (GitHub → repo → Settings → Collaborators → Add
people) y que él clone:

```powershell
git clone https://github.com/TU-USUARIO/nexosoft.git
```

Después, cada uno hace `git pull` antes de empezar a trabajar y
`git push` al terminar una tanda de commits — nada de esto está automatizado
todavía (sin CI configurado), así que por ahora es coordinación manual.

---

## 8. Notas adicionales para no romper nada

### 8.1 Reglas no negociables (ver `CLAUDE.md` para el detalle completo)

1. **Dinero nunca como `number`/`float`.** Siempre el value object `Money`
   (sobre `decimal.js`) en TS, enteros en centavos en SQLite, `NUMERIC` en
   PostgreSQL. Esto está probado con tests en `packages/domain`.
2. **Offline-first es el punto central del producto.** El POS vende contra
   SQLite local, nunca depende de la red para cobrar. Cualquier cambio que
   rompa esto rompe la propuesta de valor del sistema.
3. **Sin secretos en el repo**, nunca. Si hace falta un secreto nuevo, va a
   `.env.example` (solo el nombre) y se documenta acá.
4. **Integraciones externas siempre detrás de una interfaz + mock.** No se
   llama directo a ARCA/MercadoPago/Gemini desde el resto del código.
5. **RBAC se valida en el backend**, no solo se oculta en la UI.
6. Se trabaja **por fases**, con **OK explícito** antes de pasar a la
   siguiente, y cada decisión de arquitectura se documenta como **ADR** en
   `docs/adr/`. Si tu socio va a tocar algo que cambia una decisión ya
   tomada, que agregue un ADR nuevo en vez de simplemente cambiar el código.

### 8.2 Trampas conocidas (cosas que ya mordieron a alguien acá)

- **Placeholders SQL en Tauri**: `tauri-plugin-sql` con `sqlx` espera
  parámetros `$1, $2…`, no `?`. Todo el SQL del dominio usa `?` — el
  adaptador (`ejecutor-sql-tauri.ts`) los reescribe automáticamente. Si se
  agrega un adaptador SQL nuevo, hay que pasar por ahí.
- **Transacciones en SQLite vía Tauri**: el plugin usa un pool de conexiones
  que no garantiza que `BEGIN`/`COMMIT` sueltos caigan en la misma conexión.
  La solución (ADR-0023) es una cola de serialización interna, no
  transacciones ingenuas.
- **Permisos de Tauri (`capabilities/default.json`)**: si falta
  `sql:allow-execute` o `sql:allow-select` ahí, las queries fallan con un
  error de ACL poco claro ("Command not allowed"). Si algo deja de andar
  justo después de tocar `capabilities/`, revisar ahí primero.
- **El botón "Exacto" del cobro y el medio de pago Transferencia** tuvieron
  bugs reales donde el pago se registraba con el medio equivocado (quedaba
  todo como "Efectivo" aunque se hubiera elegido Transferencia/Tarjeta). Ya
  están corregidos, pero es un ejemplo del tipo de bug a vigilar: **valores
  hardcodeados que ignoran la selección del usuario** en el flujo de cobro.
- **`main.ts` lee la variable `PORT`**, pero `.env.example` documenta
  `API_PORT` — no es el mismo nombre. Si el backend no levanta en el puerto
  esperado, revisar esto primero (pendiente de unificar).
- **El "modo demo" autocontenido** (botón "Probar en modo demo" del POS
  instalado) usa clientes simulados en memoria que **no se ven entre sí**:
  por ejemplo, una venta hecha en modo demo no va a aparecer en la pantalla
  de Comprobantes de esa misma sesión de demo (tiene su propia lista
  sembrada aparte). No es un bug a arreglar, es una limitación conocida del
  modo demo (cada pantalla tiene su propio simulado, no una base compartida
  en memoria).
- **No hay migraciones de Prisma todavía** (`prisma db push` directo). Antes
  de tener un cliente real en producción, conviene pasar a `prisma migrate`
  para no perder historial de cambios de schema.
- **PowerShell en esta máquina**: el directorio de trabajo de la shell se
  resetea entre comandos — siempre hay que hacer `Set-Location` al repo al
  principio de cada comando. Los mensajes de commit largos conviene pasarlos
  con `git commit -F archivo.txt` en vez de `-m` inline (evita problemas de
  encoding/parseo de PowerShell 5.1).

### 8.3 Qué sigue (roadmap inmediato, decidido pero sin empezar)

Definido en una conversación reciente con el equipo, documentado acá para
que quien retome tenga el contexto:

1. **Sistema de licencias/suscripciones**: un servicio central nuevo
   (`licencias-api`, todavía no creado) para que el negocio pueda vender
   NexoSoft por suscripción, con niveles de plan que habilitan distintos
   módulos. Cada servidor de sucursal valida su licencia contra ese
   servicio central, tolerante a estar offline (no bloquea por un corte de
   internet; período de gracia antes de restringir). Pago inicial pensado
   como link de MercadoPago (no recurrente todavía), confirmación de
   renovación manual por ahora.
2. **Actualizaciones centralizadas** del POS instalado, usando el
   auto-updater nativo de Tauri, para no depender de reinstalar a mano en
   cada cliente.
3. Después de eso: CAE real ARCA (con el primer cliente), MercadoPago real,
   hardware real (impresora/lector/balanza), deploy en Railway.

### 8.4 Convenciones de idioma y estilo (resumen)

- Dominio de negocio (entidades, campos, mensajes al usuario) en
  **español**; términos técnicos (`repository`, `service`, `port`,
  `adapter`) en inglés.
- `kebab-case` para nombres de archivo; `PascalCase` para clases/tipos;
  `camelCase` para variables y funciones.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`,
  `test:`), cuerpo del commit en español.
