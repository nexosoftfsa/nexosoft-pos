# Fase 7 — Sistema de gestión completo en el POS

> Objetivo (pedido del usuario, 2026-06-28): el **POS debe tener TODO lo que
> estaba en la maqueta** (`prototipo/`), **real y funcionando**, con la **misma
> interfaz visual** de la maqueta, más toda la funcionalidad hablada al inicio del
> proyecto. Hoy la app nativa solo tiene Login, Terminal, **Ventas** y Config.

Este documento es el punto de partida del chat dedicado a la Fase 7. Las Fases
1–6 están completas (ver [README](../README.md)): dominio, POS de ventas offline,
fiscal (mock), Tauri nativo, hardware, pagos, backend NestJS, respaldo, libro
Excel, sincronización y **panel web de reportes**.

## Principios

- **Reusar la identidad visual de la maqueta** (`prototipo/styles.css`,
  `prototipo/app.js`, logo en `prototipo/assets/`). La maqueta NO tiene lógica
  real; es la referencia de UX/diseño. Hay que portarla a React en el POS.
- **Offline-first se mantiene** para vender. El ABM de gestión (catálogo, stock,
  caja) corre contra el servidor de sucursal de la LAN; donde tenga sentido,
  cachear/encolar.
- **No reinventar lógica:** el backend ya tiene endpoints de catálogo y stock, y
  el dominio (precios, IVA, comprobantes, stock, dinero exacto) está testeado.
  Mucho de esto es **UI conectada a lo que ya existe**.
- Flujo por fases: implementar + tests + README + ADR si hay decisión. Parar y
  esperar OK entre sub-fases. Español rioplatense, conventional commits chicos.

## Plan de sub-fases (orden propuesto, ajustable)

| # | Módulo | Estado backend | Trabajo principal |
| - | ------ | -------------- | ----------------- |
| **7.1** | **Shell + identidad visual** | — | Menú lateral de navegación en el POS (Ventas · Catálogo · Stock · Caja · Cuentas corrientes · Reportes · Config). Portar paleta/estilos/logo de la maqueta. Mover la pantalla de Ventas actual dentro del shell. **Base de todo lo demás.** |
| **7.2** | **Catálogo (ABM)** | ✅ CRUD en cloud-api | Pantalla de alta/baja/edición de productos: precio, costo, IVA, código de barras/interno, categoría. Conectar al backend. |
| **7.3** | **Stock** | ✅ Movimientos | Ver saldos, registrar entradas/ajustes, historial por producto. |
| **7.4** | **Caja** | 🔴 Nuevo | Apertura/cierre de caja, arqueo, ingresos/retiros de efectivo, resumen del turno. Requiere modelo nuevo en Prisma. |
| **7.5** | **Cuentas corrientes** | 🔴 Nuevo (medio `CUENTA_CORRIENTE` ya existe) | Entidad **Cliente** (no existe en el schema), venta a cuenta, registrar pagos, saldo y estado de cuenta. |
| **7.6** | **Comprobantes y anulaciones** | 🟡 Parcial | Notas de Crédito/Débito reales, anulación que emite NC, reimpresión. (La maqueta solo lo simulaba.) |
| **7.7** | **Reportes en el POS** | ✅ Endpoints `/reportes` (Fase 6) | Resumen de ventas/caja + export CSV dentro del POS, reusando los endpoints del cloud-api. |
| **7.8** | **Funciones avanzadas** | 🔴 Nuevo | Pago combinado (varios medios en una venta), presupuestos, remitos, combos/promos, lotes/vencimientos, recargos. Cada una como su propia sub-fase. |
| — | **CAE real ARCA** (WSAA/WSFEv1) | 🟡 Mock | **Diferido al primer cliente** (certificados + CUIT del comercio). No es Fase 7. |

## Decisiones a confirmar al arrancar (cambian la arquitectura)

1. **ABM online vs offline:** ¿Catálogo/Stock/Caja se editan solo ONLINE contra el
   servidor de sucursal, o también offline en el POS con cola de sync? Propuesta:
   **ABM online** (el servidor está en la LAN), **vender sigue offline-first**.
2. **Roles en el POS:** ¿Gateamos módulos por rol (cajero ve solo Ventas/Caja;
   admin ve todo)? El backend ya tiene `RolUsuario` (ADMIN/CAJERO/SUPERVISOR) y un
   `RolesGuard` (Fase 6).
3. **Modelo de Caja:** ¿una caja por terminal y por turno? definir arqueo y
   movimientos.
4. **Cliente / cuenta corriente:** hoy NO hay modelo `Cliente` en Prisma → hay que
   crearlo (datos fiscales del cliente, saldo, límite).
5. **Reportes:** ¿se duplican en el POS y el panel web, o el POS muestra una
   versión y el panel sigue siendo la vista remota del dueño? Propuesta: el POS
   tiene su vista; el panel web (Fase 6) queda como acceso remoto.
6. **Prioridad/orden:** el orden de arriba es por dependencia (shell primero) +
   valor diario. Confirmar si cambia según la urgencia del comercio.

## Cómo arrancar el chat nuevo

Decir algo como *"seguimos con NexoSoft, Fase 7"*. El asistente debe leer ESTE
documento y la memoria del proyecto primero. Empezar por **7.1 (shell + identidad
visual)**, que es la base; frenar con OK entre sub-fases.

## Referencias

- Maqueta: `prototipo/index.html`, `prototipo/styles.css`, `prototipo/app.js`,
  `prototipo/assets/logo.png`. Build portable: `node prototipo/build-standalone.js`.
- POS actual: `apps/pos-desktop/src/componentes/` (PantallaPos, PantallaLogin,
  PantallaTerminal, PantallaConfig) + `App.tsx` (máquina de fases).
- Backend: `apps/cloud-api/src/` (catalogo, stock, ventas, reportes, auth…).
- ADRs: `docs/adr/`.
