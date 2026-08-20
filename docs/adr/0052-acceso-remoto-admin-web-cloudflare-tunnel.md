# ADR-0052: Acceso remoto a `admin-web` vía Cloudflare Tunnel

- **Estado:** Aceptada
- **Fecha:** 2026-08-19
- **Decisores:** Equipo NexoSoft
- **Relacionada:** ADR-0019 (servidor de sucursal en LAN), ADR-0024 (panel web de reportes), ADR-0047 (registro cerrado, ya mencionaba este plan de pasada)

## Contexto

Fase 15 pidió que el dueño pudiera ver el panel de reportes y estadísticas
"desde cualquier dispositivo", no solo desde una PC en el local. `admin-web`
(ADR-0024) ya es exactamente ese panel — React + Vite, solo lectura, RBAC
ADMIN/SUPERVISOR — pero corre en el servidor de sucursal dentro de la LAN del
comercio (ADR-0019), no accesible desde afuera. La disyuntiva evaluada fue
construir una app Android nativa o exponer `admin-web` fuera de la LAN.

Antes de tocar código se confirmó el estado real de seguridad de `cloud-api`
para esta decisión: **no había rate-limiting/lockout de ningún tipo** en
`/auth/login` (ni `@nestjs/throttler` ni un guard custom), y **CORS estaba
abierto a cualquier origen** (`app.enableCors()` sin opciones). Exponer el
servidor a internet en ese estado habría sido negligente — cualquiera podría
intentar fuerza bruta contra el login sin ningún freno.

## Decisión

Exponer `admin-web`/`cloud-api` a internet vía **Cloudflare Tunnel** (en vez
de una app Android nativa, VPN, o exponer un puerto directo), con estos
prerrequisitos de seguridad resueltos en el mismo cambio:

1. **Rate-limiting global** (`@nestjs/throttler`, `ThrottlerModule.forRoot`
   en `app.module.ts`, guard `APP_GUARD`): 100 req/min por defecto, y un
   límite más estricto de **5 intentos/minuto por IP** en `POST /auth/login`
   y `POST /auth/login-credencial` (`@Throttle`, `auth.controller.ts`).
2. **Lockout por cuenta** (`LoginLockoutService`, en memoria): tras 5
   intentos fallidos consecutivos contra el mismo email en una ventana de 15
   minutos, `POST /auth/login` responde **429** aunque la contraseña sea
   correcta — protege contra un atacante que rota de IP para esquivar el
   límite anterior. Se audita como `LOGIN_BLOQUEADO` en `RegistroAuditoria`
   (Fase 15.A) cuando el email corresponde a un usuario real.
3. **`app.set('trust proxy', 1)`** en `main.ts`: sin esto, el rate-limiting
   por IP no sirve de nada detrás de un reverse proxy/túnel — todos los
   pedidos parecerían venir de la misma IP (la del túnel).
4. **CORS restringido por variable de entorno** (`CORS_ORIGINS`, lista
   separada por coma): sin la variable, sigue abierto a cualquier origen
   (el comportamiento de antes, correcto en LAN); se define con el dominio
   del túnel antes de exponer el servidor afuera.
5. **Responsive de `admin-web`** (`Layout.tsx`/`estilos.css`): nav lateral
   como drawer off-canvas por debajo de 768px, KPIs/paneles/tablas
   adaptados, para que el dashboard sea usable desde un celular.

**Decisión explícita sobre el JWT en `localStorage`** (`admin-web/src/auth/
almacen-sesion.ts`): se **mantiene** tal cual, no se migra a cookie
`httpOnly`. El access token dura 15 minutos y el refresh 30 días — el riesgo
real es XSS robando el refresh token de larga duración, pero `admin-web` es
una SPA de solo lectura sin inputs de usuario no confiables ni contenido de
terceros que pudiera inyectar script, así que la superficie de XSS es baja.
Migrar a cookies exigiría además resolver `SameSite`/credentials en CORS
entre el dominio del túnel y `cloud-api`, complejidad no justificada por el
riesgo real hoy. Queda anotado como evolución futura si se agrega contenido
no confiable al panel.

## Consecuencias

### Positivas
- El dueño ve el panel desde el celular, desde cualquier lugar, sin mantener
  un segundo cliente nativo (Android) ni su ciclo de release aparte.
- Los prerrequisitos de seguridad (throttling, lockout, CORS) protegen
  **todo** el `cloud-api`, no solo `admin-web` — el POS y cualquier
  integración futura que use estos mismos endpoints de login se benefician
  igual.
- `CORS_ORIGINS` vacío mantiene el comportamiento actual (LAN, sin
  restricción) — no rompe nada para los comercios que no exponen el
  servidor a internet.

### Negativas / costos
- El lockout es **en memoria**: se resetea al reiniciar `cloud-api` y no se
  comparte entre instancias. Aceptado porque `cloud-api` corre como un único
  servidor de sucursal (ADR-0019), no horizontalmente escalado; si eso
  cambia, el lockout necesita moverse a una tabla o storage compartido.
- Configurar el túnel (dominio, DNS, `cloudflared`, credenciales) es un paso
  operativo manual por comercio, fuera del repo (ver `docs/despliegue-
  cloudflare-tunnel.md`) — no es un "activalo con un flag".
- El JWT en `localStorage` sigue siendo vulnerable a XSS si en el futuro se
  agrega contenido no confiable al panel (ver decisión arriba).

## Alternativas consideradas

- **App Android nativa** — descartada explícitamente: duplica el trabajo de
  mantenimiento de un segundo cliente (build, release, actualizaciones) para
  mostrar lo mismo que `admin-web` ya muestra; con el panel responsive, un
  navegador mobile cubre el mismo caso de uso con una sola base de código.
- **VPN al servidor del comercio** — más segura en el papel, pero le exige al
  dueño instalar y configurar un cliente VPN en su celular; fricción alta
  para el perfil de usuario real (dueño de un comercio chico, no técnico).
- **Exponer el puerto directo (port-forwarding)** — requiere IP pública
  fija o DDNS, abre el puerto directamente a internet sin la capa de
  protección de Cloudflare (WAF, DDoS, oscurece la IP real del servidor), y
  la mayoría de las conexiones residenciales/comerciales tienen IP dinámica.
