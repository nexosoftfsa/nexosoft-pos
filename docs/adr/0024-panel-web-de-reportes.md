# ADR-0024: Panel web de reportes como app independiente (read-only)

- **Estado:** Aceptada
- **Fecha:** 2026-06-28
- **Decisores:** Equipo NexoSoft
- **Relacionada:** ADR-0006 (backend NestJS), ADR-0007 (dinero decimal), ADR-0019 (servidor de sucursal en LAN)

## Contexto

El dueño/encargado necesita ver cómo va el negocio (ventas, medios de pago,
productos más vendidos, stock bajo) sin tener que pararse en una caja ni abrir el
POS. El POS (Tauri) es la herramienta del cajero para **vender**; mezclar ahí los
reportes de gestión lo recargaría y obligaría a instalarlo donde está el dueño.

El `cloud-api` ya guarda toda la información necesaria (ventas con estado, medio
de pago, terminal, ítems; movimientos de stock), pero solo exponía consultas
crudas (`GET /ventas`, `GET /stock`). No había agregaciones ni control de acceso
por rol para datos sensibles de gestión.

## Decisión

La **Fase 6** agrega un **panel web de reportes**, con estas decisiones:

1. **App web nueva e independiente** (`apps/admin-web`, Vite + React + TS),
   servida desde el servidor de sucursal en la LAN. No se mete en el POS Tauri:
   separa "vender" (caja) de "controlar el negocio" (dueño), y se abre desde
   cualquier navegador de la red.
2. **Solo lectura** en esta fase: reportes y export. El CRUD de administración
   (productos, precios, usuarios) queda para una fase futura de *administración*.
3. **Reusa el auth existente** (`/auth/login`, JWT) — sin segundo sistema de
   identidad.
4. **RBAC**: los endpoints de reportes quedan restringidos a **ADMIN/SUPERVISOR**
   mediante un `RolesGuard` + `@Roles(...)` nuevos. Un CAJERO no ve reportes de
   gestión.
5. **Agregación en el backend** (`ReportesService`), devolviendo dinero como
   string con 2 decimales (`Decimal.toFixed(2)`) para no perder exactitud en el
   transporte ni depender de `float` en el cliente.
6. **Gráficos con Recharts** en el cliente (estándar React, liviano), tablas
   propias.

### Estrategia de agregación

Se traen las filas del rango con un `select` acotado y se agregan en memoria con
`Decimal`, igual que `StockService`. Es consistente con el resto del backend y
fácil de testear sin base real. Para volúmenes muy grandes convendría mover la
agregación a SQL (`groupBy`/vistas materializadas); para una sucursal del MVP
alcanza de sobra. Queda anotado como evolución futura.

## Consecuencias

### Positivas

- El dueño obtiene visibilidad ("control del dueño") sin tocar las cajas.
- Separación de responsabilidades: el POS no se infla con pantallas de gestión.
- Reusa auth, modelo de datos y el criterio de dinero exacto ya establecidos.
- El `RolesGuard` queda disponible para proteger otros endpoints sensibles.

### Negativas / costos

- Una app más para construir y desplegar (mitigado: build estático servible desde
  el propio `cloud-api`, sub-fase 6.5).
- La agregación en memoria no escala a millones de filas (mitigado: alcance MVP +
  nota de evolución a SQL).

## Alternativas consideradas

- **Reportes dentro del POS Tauri** — descartado: mezcla roles, obliga a instalar
  el POS donde está el dueño y recarga la app de caja.
- **Agregación en SQL desde el inicio** (`groupBy`/vistas) — descartado por ahora:
  más complejo de testear sin aportar valor al volumen del MVP. Camino de
  evolución claro si hace falta.
- **Panel de administración completo (con CRUD) ya en Fase 6** — diferido: el
  pedido concreto fue "panel de reportes"; el CRUD admin es una fase aparte.
