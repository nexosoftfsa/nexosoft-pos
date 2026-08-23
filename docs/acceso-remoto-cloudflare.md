# Acceso remoto al panel — alta de un comercio

Procedimiento **operativo** (no código del repo) para que el dueño de un
comercio pueda ver el panel de reportes desde afuera del local, en
`https://<comercio>.nexosoft.com.ar`. La decisión y sus costos están en
[ADR-0055](adr/0055-acceso-remoto-tunel-con-nombre-por-comercio.md); los
prerrequisitos de seguridad (rate-limiting, lockout de cuenta, `trust
proxy`) ya están resueltos en `cloud-api` desde
[ADR-0052](adr/0052-acceso-remoto-admin-web-cloudflare-tunnel.md).

Es **opcional**: sin esto todo el sistema funciona igual y el panel se ve
desde la red del local (ver [instalacion-primer-cliente.md](instalacion-primer-cliente.md)).

**Todo se hace por línea de comandos, a propósito**: así no hace falta entrar
a **Cloudflare Zero Trust**, que para usar su panel pide cargar una tarjeta
de crédito aunque el plan sea gratuito. Con `cloudflared tunnel login` alcanza
una cuenta común de Cloudflare con `nexosoft.com.ar` adentro.

En la PC del comercio no se instala ni se configura nada de Cloudflare: solo
se pega el código del paso 3.

---

## 0. Una sola vez, antes del primer comercio (en nuestra PC)

```powershell
cloudflared tunnel login
```

Abre el navegador: elegir `nexosoft.com.ar` y autorizar. Deja
`%USERPROFILE%\.cloudflared\cert.pem`.

> **`cert.pem` es un secreto de NUESTRA cuenta**: con él se pueden crear y
> borrar túneles y tocar el DNS del dominio. Nunca se sube al repo ni se
> copia a la PC de un cliente — al comercio solo le llega el código de
> activación de *su* túnel.

Si no tenés `cloudflared` a mano, sale de
`.\scripts\release\preparar-runtimes-instalador.ps1` (queda en
`instalador-servidor\runtime\cloudflared\`).

## 1. Dar de alta el comercio (un comando)

```powershell
.\scripts\release\generar-codigo-acceso-remoto.ps1 -Subdominio lagus
```

Eso, en una sola corrida: crea el túnel `nexosoft-lagus` en nuestra cuenta,
apunta el CNAME de `lagus.nexosoft.com.ar` al túnel, y arma el **código de
activación**. Si el túnel ya existía, lo reusa.

> **Un solo nivel de subdominio.** `lagus.nexosoft.com.ar` sí;
> `panel.lagus.nexosoft.com.ar` no — el certificado universal gratuito de
> Cloudflare cubre `nexosoft.com.ar` y `*.nexosoft.com.ar`, un nivel más
> abajo daría error de certificado en el celular del dueño.

## 2. El código de activación

Es **un solo string** para mandarle al comercio: el hostname más las
credenciales de su túnel, en base64 (no está cifrado). Tratalo como una
contraseña y mandáselo únicamente al comercio que corresponde, por un canal
directo. Quien lo tenga puede levantar *ese* túnel — nada más: no da acceso
al dominio ni a los otros comercios.

## 3. Activarlo en la PC del comercio

Cualquiera de las dos, según el momento:

- **Durante la instalación**: el instalador del servidor tiene una pantalla
  "Acceso remoto (opcional)" — pegar ahí el código. Si se deja vacía,
  instala sin acceso remoto.
- **Después, por teléfono**: en el POS de la PC de Caja, **Configuración →
  Acceso remoto**, pegar el código y **Activar**. Windows pide permiso de
  administrador una vez. En 10-20 segundos la tarjeta muestra la dirección
  con un **QR** para escanear con el celular.

A mano (soporte remoto), lo mismo hace:

```powershell
C:\NexoSoft-Servidor\scripts\instalar-acceso-remoto.ps1 -Accion activar -Codigo "<codigo>"
```

## 4. Verificación

- En el POS, la tarjeta de Acceso remoto tiene que decir **"Se está viendo
  bien desde afuera"** (el propio servidor prueba la vuelta completa por
  Cloudflare, no solo que el servicio esté arriba).
- Abrir `https://<comercio>.nexosoft.com.ar` **desde un celular con datos
  móviles** (no el Wi-Fi del local) y entrar como ADMIN/SUPERVISOR.
- Probar el lockout: 6 intentos de login con contraseña incorrecta tienen
  que devolver 429 en el sexto (ADR-0052).

---

## Operación

| Qué | Dónde |
| --- | --- |
| Apagar el acceso remoto | POS → Configuración → Acceso remoto → "Desactivar" |
| Volver a activarlo | Mismo lugar → "Volver a activar" (usa lo ya guardado) |
| Ver qué pasó | `C:\ProgramData\NexoSoft\logs\acceso-remoto.log` y `cloudflared.log` |
| Estado a mano | `instalar-acceso-remoto.ps1 -Accion estado` |
| Ver los túneles (nuestra PC) | `cloudflared tunnel list` / `cloudflared tunnel info nexosoft-<comercio>` |
| Dar de baja del todo | `-Accion desactivar` en la PC **y** `cloudflared tunnel delete nexosoft-<comercio>` |

Archivos que quedan en la PC del comercio, en `C:\ProgramData\NexoSoft\`:

- `cloudflared\<id-del-túnel>.json` — **credenciales del túnel**. ACL cerrada
  (solo SYSTEM y Administradores). Nunca sale por la API.
- `cloudflared\config.yml` — a qué apunta el túnel. Lo valida `cloudflared`.
- `acceso-remoto.json` — estado que muestra el POS (dirección y si responde).
  Sin secretos: esto sí lo lee `cloud-api`.

## Notas

- El túnel **no abre ningún puerto** del router del comercio: la conexión
  sale desde la PC hacia Cloudflare, nunca al revés. No hay que tocar el
  router ni el firewall del ISP.
- `cloudflared` corre como **tarea programada de Windows** (`NexoSoft Acceso
  Remoto`): arranca sola al prender la PC y se reinicia sola si se cae, igual
  que las tareas del `cloud-api` y de PostgreSQL. Se usa tarea en vez de
  `cloudflared service install` para apuntar al `config.yml` con una ruta
  explícita, sin depender de dónde busca `cloudflared` su configuración
  cuando corre como SYSTEM.
- **CORS no hace falta tocarlo**: el panel lo sirve el mismo `cloud-api`
  (`VITE_API_URL=/api/v1`), así que las llamadas van al mismo origen que la
  página. `CORS_ORIGINS` sigue existiendo para otros usos (ver ONBOARDING).
- Si el comercio cambia de PC, repetir el paso 3 en la PC nueva con el mismo
  código (el túnel y el subdominio se reusan tal cual) y desactivarlo en la
  vieja. **Dos PC con el mismo túnel a la vez no rompen nada** — Cloudflare
  balancea entre las dos —, pero la vieja seguiría sirviendo su propia base
  de datos: desactivala.
