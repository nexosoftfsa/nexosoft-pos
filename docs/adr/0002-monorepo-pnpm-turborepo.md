# ADR-0002: Monorepo con pnpm + Turborepo

- **Estado:** Aceptada
- **Fecha:** 2026-06-07

## Contexto

El cliente POS y el backend comparten reglas de negocio (dinero, IVA,
comprobantes). Duplicar esa lógica es un riesgo fiscal y de mantenimiento.
Necesitamos compartir tipos y dominio sin publicar paquetes a un registry.

## Decisión

Monorepo con **pnpm workspaces** + **Turborepo**. Un paquete compartido
`@nexosoft/domain` consumido como *internal package* (`workspace:*`, código TS
transpilado por el consumidor). Turborepo orquesta `build/test/lint/typecheck`
con caché.

## Consecuencias

### Positivas
- Una sola fuente de verdad del dominio; refactors atómicos cross-package.
- pnpm: instalación rápida y `node_modules` eficiente (store con enlaces).
- Caché de tareas y ejecución en paralelo con Turborepo.

### Negativas / costos
- pnpm no viene instalado en este entorno (se resuelve con `corepack`).
- Curva inicial de configuración del workspace.

## Alternativas consideradas

- **npm/yarn workspaces sin Turbo** — sin caché de tareas ni orquestación.
- **Nx** — más potente pero más pesado/opinado de lo que necesita el MVP.
- **Multi-repo** — reintroduce duplicación de dominio y versionado cruzado.
