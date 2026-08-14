# ADR-0047: `POST /auth/register` cerrado salvo alta del primer ADMIN

- **Estado:** Aceptada
- **Fecha:** 2026-08-14
- **Decisores:** Equipo NexoSoft
- **Relacionada:** ADR-0006 (backend NestJS/PostgreSQL)

## Contexto

`POST /auth/register` no tenía guard alguno: cualquiera con acceso a la red
donde corre `cloud-api` (la LAN del comercio, y peor aún si el servidor
llegara a exponerse a internet — ver plan de Cloudflare Tunnel para el panel
`admin-web`) podía autoregistrarse, incluido con `rol: "ADMIN"` y cualquier
`sucursalId`, sin ninguna sesión previa. Se detectó al preparar la instalación
del primer cliente real.

## Decisión

Nuevo `RegistroGuard` (`apps/cloud-api/src/auth/registro.guard.ts`) en
`POST /auth/register`:

1. Si `usuario.count() === 0` (instalación nueva, sin usuarios todavía) deja
   pasar sin autenticación — es el alta del primer ADMIN durante la puesta en
   marcha.
2. En cuanto existe al menos un usuario, exige sesión válida (`JwtAuthGuard`)
   **y** rol `ADMIN` (`ForbiddenException` si no).

La ventana de registro público se cierra sola apenas se crea el primer
usuario — no hace falta un flag de configuración ni un paso manual extra en
la instalación.

## Consecuencias

### Positivas
- Cierra la brecha sin romper el flujo de instalación (el primer ADMIN se
  sigue dando de alta con un simple `POST /auth/register`, sin credenciales
  previas).
- Alta de usuarios subsiguientes queda auditable: solo un ADMIN autenticado
  puede crear cuentas nuevas.

### Negativas / costos
- Si alguna vez se borra manualmente a todos los usuarios de una sucursal
  (no hay flujo para eso hoy), el registro se reabre sin auth hasta que se
  cree el primero de nuevo — riesgo aceptado porque no existe ese camino en
  la UI.

## Alternativas consideradas

- **Endpoint de bootstrap separado con token de un solo uso** — más seguro
  pero mucho más operativo para una instalación de un comercio chico; se
  descarta por ahora, sin caso de uso que lo justifique.
- **Bloquear `register` por completo y sembrar el primer usuario por script/
  seed** — descartado: agrega un paso de instalación (acceso a la base,
  correr un script) que este comercio no necesita.
