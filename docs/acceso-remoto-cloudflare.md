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

**Lo que se hace una sola vez por comercio son los pasos 1 a 3, en nuestra
PC.** En la PC del comercio no se instala ni se configura nada de
Cloudflare: solo se pega el código del paso 4.

---

## 1. Crear el túnel del comercio (en nuestra cuenta de Cloudflare)

En el panel de **Cloudflare Zero Trust** → **Networks → Tunnels** →
**Create a tunnel** → tipo **Cloudflared**:

- Nombre: `nexosoft-<comercio>` (por ejemplo `nexosoft-lagus`).
- Al crearlo, Cloudflare muestra el comando de instalación con un
  **token largo** (arranca con `eyJ...`). **Ese token es lo único que se
  necesita** — copiarlo; el comando que muestra la pantalla no se usa.

## 2. Darle el subdominio (Public hostname)

En el mismo túnel, pestaña **Public Hostname** → **Add a public hostname**:

| Campo | Valor |
| --- | --- |
| Subdomain | `<comercio>` (por ejemplo `lagus`) |
| Domain | `nexosoft.com.ar` |
| Type | `HTTP` |
| URL | `localhost:3000` |

Cloudflare crea el CNAME solo, no hay que tocar el DNS a mano.

> **Un solo nivel de subdominio.** `lagus.nexosoft.com.ar` sí;
> `panel.lagus.nexosoft.com.ar` no — el certificado universal gratuito de
> Cloudflare cubre `nexosoft.com.ar` y `*.nexosoft.com.ar`, un nivel más
> abajo daría error de certificado en el celular del dueño.

## 3. Generar el código de activación (en nuestra PC)

```powershell
.\scripts\release\generar-codigo-acceso-remoto.ps1 -Subdominio lagus -Token "eyJhIjoi..."
```

Imprime **un solo string** para mandarle al comercio. Es el hostname + el
token en base64 (no está cifrado): tratalo como el token mismo y mandáselo
únicamente al comercio que corresponde, por un canal directo.

## 4. Activarlo en la PC del comercio

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

## 5. Verificación

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
| Volver a activarlo | Mismo lugar → "Volver a activar" (usa el token ya guardado) |
| Ver qué pasó | `C:\ProgramData\NexoSoft\logs\acceso-remoto.log` |
| Estado a mano | `instalar-acceso-remoto.ps1 -Accion estado` |
| Dar de baja del todo | Borrar el túnel en Cloudflare **y** `-Accion desactivar` en la PC |

Archivos que quedan en la PC del comercio:

- `C:\ProgramData\NexoSoft\acceso-remoto-config.json` — hostname y **token**.
  ACL cerrada (solo SYSTEM y Administradores). Nunca sale por la API.
- `C:\ProgramData\NexoSoft\acceso-remoto.json` — estado que muestra el POS
  (dirección y si responde). Sin secretos: esto sí lo lee `cloud-api`.

## Notas

- El túnel **no abre ningún puerto** del router del comercio: la conexión
  sale desde la PC hacia Cloudflare, nunca al revés. No hay que tocar el
  router ni el firewall del ISP.
- `cloudflared` queda como **servicio de Windows** (arranca solo al prender
  la PC, se reinicia solo si se cae). No hay ningún script supervisor
  nuestro dando vueltas.
- **CORS no hace falta tocarlo**: el panel lo sirve el mismo `cloud-api`
  (`VITE_API_URL=/api/v1`), así que las llamadas van al mismo origen que la
  página. `CORS_ORIGINS` sigue existiendo para otros usos (ver ONBOARDING).
- Si el comercio cambia de PC, hay que repetir el paso 4 en la PC nueva (el
  túnel y el subdominio se reusan tal cual) y desactivarlo en la vieja.
