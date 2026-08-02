# NexoSoft

Sistema de **ventas y gestión comercial (POS)** para un comercio mediano
argentino. **Offline-first**, con integración fiscal **ARCA (ex AFIP)**,
hardware de comercio (impresoras ESC/POS, balanzas, lectores) y backend cloud
multi-sucursal.

> **Estado: Fases 1–6 completas.** Dominio, POS offline, fiscal (mock), Tauri,
> hardware, pagos, backend NestJS, respaldo a nube propia, libro de ventas Excel,
> sincronización terminal↔servidor, POS nativo instalable (NSIS) y **panel web de
> reportes** están implementados y testeados.
> Pendiente clave para producción legal: **CAE real ARCA** (se integra con el
> primer cliente, junto a sus certificados y CUIT). Ver [Roadmap](#roadmap-de-fases).

## Características clave

- 🧾 **Facturación ágil** con código de barras, código interno o descripción.
- 📴 **Offline-first de verdad**: vender, cobrar e imprimir sin internet; el CAE
  se solicita a ARCA y la venta se sincroniza al recuperar conexión.
- 💵 **Dinero exacto**: tipos decimales, sin `float`. Ver [ADR-0007](docs/adr/0007-manejo-de-dinero-decimal-exacto.md).
- 🏪 **Servidor de sucursal en la LAN**: varias cajas comparten datos sin nube
  paga; la nube es opcional para multi-sucursal ([ADR-0019](docs/adr/0019-topologia-servidor-de-sucursal-lan.md)).
- 💾 **Respaldo en la nube propia del cliente** (Drive/OneDrive/NAS) + **libro de
  ventas en Excel** para el dueño ([ADR-0020](docs/adr/0020-respaldo-en-nube-propia.md), [ADR-0021](docs/adr/0021-libro-de-ventas-excel-y-respaldo-en-venta.md)).
- 🔐 **Seguridad**: JWT (access + refresh), RBAC por rol, secretos fuera del repo.

## Arquitectura (resumen)

```
   SUCURSAL (LAN del comercio)
   ┌───────────────────────────────────────┐
   │  Servidor de sucursal (una PC/mini-PC) │
   │   cloud-api (NestJS) + PostgreSQL      │──► ARCA (WSAA + WSFEv1)
   │   Respaldo → nube propia del cliente   │──► (Railway opcional, multi-sucursal)
   └───────▲───────────────▲────────────────┘
           │ HTTP/LAN       │
     ┌─────┴────┐     ┌─────┴────┐
     │ Caja 1   │ ... │ Caja N   │   POS Tauri + React + SQLite (offline-first)
     └──────────┘     └──────────┘   ESC/POS · balanza · lector
```

Detalle en [docs/arquitectura.md](docs/arquitectura.md) y [docs/adr/](docs/adr/) (21 ADRs).

## Estructura del monorepo

```
.
├── apps/
│   ├── pos-desktop/     # Cliente POS (Tauri 2 + React + TS) — offline-first + sync
│   └── cloud-api/       # Backend (NestJS + PostgreSQL + Prisma)
├── packages/
│   ├── domain/          # Tipos y lógica de negocio compartida (dinero, IVA, comprobantes)
│   ├── app/             # Casos de uso + adaptador SQLite (EjecutorSql)
│   ├── fiscal/          # Integración ARCA aislada (+ mock)
│   ├── pagos/           # Pasarela MercadoPago aislada (+ mock)
│   ├── sync/            # Cola outbox de sincronización offline-first
│   ├── hardware/        # Periféricos ESC/POS, balanza, lector (+ mocks)
│   └── ui/              # Componentes UI compartidos
├── docs/                # Arquitectura y ADRs
└── CLAUDE.md            # Convenciones para trabajar en el repo
```

## Prerrequisitos

| Herramienta     | Versión           | Notas                                          |
| --------------- | ----------------- | ---------------------------------------------- |
| Node.js         | ≥ 22 (probado 24) | —                                              |
| pnpm            | 9.x               | `corepack enable pnpm`                         |
| Rust + Cargo    | estable (1.96)    | Instalado. Para el cliente Tauri.              |
| Tauri (sistema) | —                 | Windows: WebView2 + Build Tools C++ (instalados) |
| PostgreSQL      | ≥ 16              | Servidor de sucursal. Para tests/e2e se usa `embedded-postgres` (sin Docker) |

## Comandos útiles

```bash
corepack enable pnpm
pnpm install

# Tests (por filtro explícito; pnpm -r falla en stubs sin tests)
corepack pnpm --filter @nexosoft/domain --filter @nexosoft/app --filter @nexosoft/fiscal \
  --filter @nexosoft/hardware --filter @nexosoft/pagos --filter @nexosoft/sync \
  --filter @nexosoft/cloud-api --filter @nexosoft/pos-desktop test

# POS en navegador (datos en memoria, cliente de sync simulado)
corepack pnpm --filter @nexosoft/pos-desktop dev

# Backend + e2e real contra PostgreSQL embebido (sin Docker)
corepack pnpm --filter @nexosoft/cloud-api verify:e2e
```

## Roadmap de fases

| Fase | Contenido                                                              | Estado |
| ---- | -------------------------------------------------------------------- | ------ |
| 1    | Dominio + catálogo + stock + POS offline + SQLite + UI                | ✅ |
| 2    | Fiscal ARCA (CAE) + Notas de Crédito/Débito                          | ✅ |
| 3    | Tauri nativo + hardware (ESC/POS, lector) + pagos MercadoPago         | ✅ |
| 4    | Backend NestJS + respaldo nube propia + libro Excel + sync terminal↔servidor | ✅ |
| 5    | **POS nativo productivo**: adaptadores reales en Tauri (SQLite/HTTP), pull de catálogo, login + terminal, configuración, instalador NSIS | ✅ |
| 6    | **Panel web de reportes** (`apps/admin-web`): login + RBAC, dashboard de ventas, productos/stock, export CSV + libro Excel, servido por el cloud-api | ✅ |
| 7    | **Sistema de gestión completo en el POS** (UI de la maqueta, real): catálogo, stock, caja, cuentas corrientes, comprobantes/NC, reportes y funciones avanzadas. Ver [roadmap Fase 7](docs/roadmap-fase-7-gestion.md). **7.1 ✅** shell + identidad visual + menú por rol · **7.2 ✅** catálogo (ABM online) · **7.3 ✅** stock (saldos, movimientos, historial) · **7.4 ✅** caja (turnos, arqueo, tesorería) · **7.5 ✅** cuentas corrientes (clientes + ledger) · **7.6 ✅** comprobantes y anulaciones (NC) · **7.7 ✅** reportes en el POS · **7.8** funciones avanzadas (**pago combinado ✅**, **recargos ✅**, **presupuestos ✅**, **remitos ✅**; **combos/promos y lotes/vencimientos → Fase 8**) | ✅ |
| 8    | **Funciones avanzadas de producto**: combos/promos y lotes/vencimientos. **8.1.a ✅** combos en el cloud-api (producto compuesto: alta en catálogo + descuento de stock por componente al vender y al anular) + ABM en el POS · **8.1.b ✅** combo **vendible offline-first** (dominio + pull + SQLite expanden el combo a sus componentes al vender). Ver [ADR-0033](docs/adr/0033-combos-producto-compuesto.md) · **8.2 lotes/vencimientos**: **8.2.a ✅** backend (`requiereLote` por producto, modelo `Lote`, ENTRADA con lote + SALIDA/VENTA por **FEFO**, alertas de vencimiento; ver [ADR-0034](docs/adr/0034-lotes-y-vencimientos-fefo.md)) · **8.2.b ✅** POS (perecedero en el catálogo, entrada con lote/vencimiento, vista de lotes y panel de alertas de vencimiento en Stock) | ✅ |
| 9    | **Compilación final (demo lista para el cliente)**: presupuesto→venta real ([ADR-0035](docs/adr/0035-presupuesto-a-venta.md)), remito→mueve stock ([ADR-0036](docs/adr/0036-remito-mueve-stock.md)), venta fiada a cuenta corriente ([ADR-0037](docs/adr/0037-venta-a-cuenta-corriente.md)), promociones 2x1/% en el POS ([ADR-0038](docs/adr/0038-promociones-en-el-pos.md)); fixes de reportes en hora local AR y del panel de cobro; seed de demo realista + e2e de combos/lotes contra Postgres real; pantallas Inicio y Asistente IA con Google Gemini real ([ADR-0039](docs/adr/0039-asistente-ia-gemini.md)), configurable desde la UI sin tocar archivos ([ADR-0040](docs/adr/0040-configuracion-asistente-desde-ui.md)); "modo demo" autocontenido en el instalador (sin backend) | ✅ |
| 10   | **Primeros pasos con un cliente real**: ajustes que surgen de instalar NexoSoft en un comercio concreto. **10.1 ✅** modo de venta **sin alta en ARCA** (ticket interno sin CAE ni numeración fiscal, activable/desactivable desde `PantallaConfig` — ver [ADR-0041](docs/adr/0041-modo-de-venta-sin-arca.md)) · **10.2 ✅** importador de catálogo (`pnpm --filter @nexosoft/cloud-api importar:catalogo`, lee Excel por nombre de columna, idempotente; 711/711 artículos reales importados sin errores — ver [ADR-0042](docs/adr/0042-importador-de-catalogo.md)) · 10.3 impresora térmica real (ESC/POS físico) · 10.4 impresión A4 del comprobante · 10.5 etiquetas de góndola | 🚧 |
| —    | Pendientes posteriores: CAE real ARCA (se integra con el primer cliente), deploy (Railway), multi-sucursal cloud | ⏳ |

### Qué incluye la Fase 5 (propuesta)

El POS hoy corre en el navegador con datos en memoria y un cliente de sync
simulado. La Fase 5 lo lleva a **app de escritorio instalable**, enchufando lo
que ya está construido y testeado, sin reescribir la UI:

1. **`EjecutorSql` real** sobre `@tauri-apps/plugin-sql` → activa `AlmacenSqlite`
   (cola persistente) y los repositorios SQLite del dominio en Tauri.
2. **`ClienteSyncHttp` real** apuntando al servidor de sucursal (hoy está el
   simulado en el navegador).
3. **Login** (JWT contra `/auth/login`) y **selección de terminal**.
4. **Configuración** de carpeta de respaldo y datos del comercio.
5. **Instalador** nativo (`pnpm tauri:build`).

Las fases se construyen de a una, con tests y README por módulo, y **no se
avanza sin tu OK**.
