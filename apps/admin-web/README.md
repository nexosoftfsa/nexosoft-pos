# @nexosoft/admin-web

**Panel web de reportes** para el dueño/encargado ([ADR-0024](../../docs/adr/0024-panel-web-de-reportes.md)).
React + Vite + TypeScript. **Solo lectura**: consume los endpoints `/reportes` del
`cloud-api`. App independiente del POS, pensada para abrirse desde cualquier
navegador de la LAN del comercio — y, si el comercio tiene el acceso remoto
dado de alta ([ADR-0055](../../docs/adr/0055-acceso-remoto-tunel-con-nombre-por-comercio.md)),
desde cualquier lugar en `https://<comercio>.nexosoft.com.ar`.

> Estado: **Fase 6 COMPLETA** — scaffold + login + shell (6.2), dashboard de
> ventas (6.3), reportes de productos y stock (6.4) y **export CSV + descarga del
> libro de ventas Excel + serve estático desde el cloud-api** (6.5).
> **Fase 15.B**: layout responsive (nav como drawer en mobile, `Layout.tsx`/
> `estilos.css`) para verlo bien desde el celular.

## Cómo correrlo

```bash
# desde la raíz del monorepo
corepack pnpm --filter @nexosoft/admin-web dev        # http://localhost:5174
corepack pnpm --filter @nexosoft/admin-web build      # tsc + vite build
corepack pnpm --filter @nexosoft/admin-web test       # vitest
```

La URL del backend se toma de `VITE_API_URL` (default
`http://localhost:3000/api/v1`). Para apuntar al servidor de sucursal:

```bash
VITE_API_URL=http://192.168.0.10:3000/api/v1 corepack pnpm --filter @nexosoft/admin-web build
```

### Servir el panel desde el cloud-api (producción)

El `cloud-api` puede servir el panel ya compilado (no hace falta un proceso
aparte). Se construye el panel y se apunta `PANEL_RUTA` al `dist` (o se copia a
`./panel` junto al backend):

```bash
corepack pnpm --filter @nexosoft/admin-web build           # genera dist/
PANEL_RUTA=/ruta/a/apps/admin-web/dist corepack pnpm --filter @nexosoft/cloud-api start
```

El backend sirve el panel en `/` y la API sigue en `/api/v1` (excluida del
static). Como es un SPA, las rutas internas (`/ventas`, etc.) caen en
`index.html`.

## Cómo está armado

- **`api/`** — `config.ts` (URL base), `cliente-http.ts` (`ClienteApi`: GET tipado
  con Bearer, query string y `ErrorApi` con status), `auth.ts` (`iniciarSesion`).
- **`auth/`** — `token.ts` (decodifica el JWT para leer `rol/email/sucursalId/exp`;
  el cloud-api no devuelve el usuario en el login), `almacen-sesion.ts`
  (persistencia en `localStorage`), `contexto-sesion.tsx` (`ProveedorSesion` +
  `useSesion`: estado de sesión, login/logout, `ClienteApi` ya configurado).
- **`componentes/`** — `PantallaLogin` (+ `SinAcceso`), `RutaProtegida` (exige
  sesión y rol ADMIN/SUPERVISOR — UX; la autorización real la impone el
  `RolesGuard` del backend), `Layout` (barra lateral + header con usuario/logout).
- **`paginas/`** — `Resumen` (KPIs + gráfico de serie + torta de medios de pago),
  `Ventas` (tablas por medio de pago y por terminal), `Productos` (top vendidos con
  rango + Top N), `Stock` (stock bajo con umbral configurable).
- **`hooks/useReporte.ts`** — carga datos con estado de carga/error y cancela
  resultados obsoletos al cambiar el rango.
- **`api/reportes.ts`** — funciones tipadas de los endpoints `/reportes` (incluye
  `libroVentas`, que descarga el Excel como Blob).
- **`csv.ts`** — `aCsv` (escapado) + `descargarCsv`/`descargarBlob` para exportar
  reportes a CSV y bajar archivos en el navegador.
- **`componentes/`** (reportes) — `SelectorRango` (presets + fechas), `TarjetaKpi`,
  `GraficoSerie`/`GraficoMedioPago` (Recharts), `EstadoReporteVista`
  (carga/error/vacío). `formato.ts` formatea moneda (es-AR), fechas y medios de pago.

## Acceso

Solo **ADMIN/SUPERVISOR**. Un usuario sin ese rol ve la pantalla "sin acceso";
y aunque la sortee, el backend responde **403** (RBAC en el `cloud-api`).

## Tests

`token.spec.ts` (decode de JWT, expiración, gating por rol),
`cliente-http.spec.ts` (headers, query string, manejo de errores),
`formato.spec.ts` (moneda, fechas, medios de pago) y `csv.spec.ts` (escapado) —
21 tests. La UI se verifica en el navegador con el preview.
