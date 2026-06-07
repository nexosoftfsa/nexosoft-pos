# NexoSoft

Sistema de **ventas y gestión comercial (POS)** para un comercio mediano
argentino. **Offline-first**, con integración fiscal **ARCA (ex AFIP)**,
hardware de comercio (impresoras ESC/POS, balanzas, lectores) y backend cloud
multi-sucursal.

> **Estado actual: Fase 0 — Arquitectura y scaffolding.** Todavía no hay código
> de negocio. Ver [Roadmap](#roadmap-de-fases) y [docs/](docs/).

## Características clave

- 🧾 **Facturación ágil** con código de barras, código interno o descripción.
- 📴 **Offline-first de verdad**: vender, cobrar e imprimir sin internet; el CAE
  se solicita a ARCA al recuperar conexión.
- 💵 **Dinero exacto**: tipos decimales, sin `float` (IVA, impuestos internos,
  redondeo, vuelto). Ver [ADR-0007](docs/adr/0007-manejo-de-dinero-decimal-exacto.md).
- 🔐 **Seguridad**: RBAC (Administrador/Supervisor/Cajero), auditoría, secretos y
  certificados fuera del repo.
- ☁️ **Cloud multi-sucursal** con sincronización y resolución de conflictos.

## Arquitectura (resumen)

```
┌──────────────────────────┐         ┌───────────────────────────┐
│  POS de escritorio        │  sync   │  Cloud API (NestJS)        │
│  Tauri 2 + React + TS     │ <─────> │  PostgreSQL                │
│  SQLite (fuente local)    │         │  + Servicio Fiscal (ARCA)  │
│  ESC/POS · balanza · lector│        └───────────────────────────┘
└──────────────────────────┘                     │
            ▲                                     ▼
            └────── @nexosoft/domain ──────  ARCA (WSAA + WSFEv1)
                 (tipos/lógica compartida)
```

Detalle completo en [docs/arquitectura.md](docs/arquitectura.md) y las
decisiones en [docs/adr/](docs/adr/).

## Estructura del monorepo

```
.
├── apps/
│   ├── pos-desktop/     # Cliente POS (Tauri 2 + React + TS)
│   └── cloud-api/       # Backend (NestJS + PostgreSQL)
├── packages/
│   ├── domain/          # Tipos y lógica de negocio compartida
│   ├── fiscal/          # Integración ARCA aislada (+ mock)
│   ├── sync/            # Sincronización offline-first
│   ├── hardware/        # Periféricos (ESC/POS, balanza, lector) (+ mocks)
│   └── ui/              # Componentes UI compartidos
├── docs/                # Arquitectura y ADRs
└── CLAUDE.md            # Convenciones para trabajar en el repo
```

## Prerrequisitos

| Herramienta    | Versión       | Notas                                              |
| -------------- | ------------- | -------------------------------------------------- |
| Node.js        | ≥ 22 (probado 24) | —                                              |
| pnpm           | 9.x           | `corepack enable pnpm`                             |
| Rust + Cargo   | estable       | **Sólo para el cliente Tauri.** No está instalado. |
| Tauri (sistema)| —             | Windows: WebView2 + Build Tools C++                |
| PostgreSQL     | ≥ 16          | Sólo para el backend                               |

## Puesta en marcha (cuando arranque la Fase 1)

```bash
corepack enable pnpm
pnpm install
cp .env.example .env   # completar valores
pnpm dev               # turbo orquesta apps/paquetes
```

## Roadmap de fases

| Fase | Contenido                                               | Estado |
| ---- | ------------------------------------------------------- | ------ |
| 0    | Arquitectura, scaffolding, ADRs, modelo de datos        | ✅ en curso |
| 1    | Catálogo + Stock + POS offline (sin fiscal)             | ⏳ |
| 2    | ARCA (WSAA/WSFEv1), comprobantes y cola de CAE          | ⏳ |
| 3    | Caja/Tesorería + Cuentas Corrientes                     | ⏳ |
| 4    | Reportes y dashboards                                   | ⏳ |
| 5    | IA (OCR + asistente) y módulos de especialidad          | ⏳ |
| 6    | Multi-sucursal, hardening de seguridad y backups        | ⏳ |

Las fases se construyen de a una, con tests y README por módulo, y **no se
avanza sin tu OK**.
