# ADR-0057: El acceso remoto es de sólo lectura, por un puerto propio, y queda auditado

- **Estado:** Aceptada
- **Fecha:** 2026-08-23
- **Decisores:** Equipo NexoSoft
- **Relacionada:** ADR-0055 (acceso remoto con subdominio fijo por comercio),
  ADR-0052 (rate-limiting, lockout y `trust proxy`), ADR-0024 (el panel web es
  de sólo lectura), ADR-0051 (credencial de empleado)

## Contexto

Desde ADR-0055 el panel de reportes de cada comercio se publica en internet.
Funciona, y es lo que más entusiasma a los clientes — pero el túnel no expone
sólo el panel: expone **toda la API del comercio**. Los endpoints están
protegidos por JWT, y ADR-0052 dejó rate-limiting y lockout que hacen inviable
la fuerza bruta. Aun así, quedan dos huecos incómodos:

1. **Si una credencial se filtra, el daño es total.** Un token de ADMIN
   robado permite, desde cualquier lugar del mundo, modificar catálogo,
   usuarios y ventas. Y algunas *lecturas* son igual de sensibles: `GET
   /usuarios/:id/credencial` devuelve la credencial de empleado (ADR-0051),
   que sirve para iniciar sesión.
2. **No queda rastro.** El dueño no tiene forma de saber si alguien entró a su
   panel desde afuera, ni cuándo.

Lo que hace que el hueco 1 sea innecesario: `admin-web` **ya es de sólo
lectura por diseño** (ADR-0024). Todo lo que el panel necesita son nueve
endpoints, ocho de ellos `GET`.

Además, el subdominio no es secreto: los registros de Certificate Transparency
publican cada certificado que emite Cloudflare, así que cualquiera puede
enumerar los subdominios de `nexosoft.com.ar`. La seguridad no puede apoyarse
en que nadie conozca la dirección.

## Decisión

### 1. Un puerto dedicado para el túnel

`cloud-api` escucha en **dos** puertos con la misma aplicación:

- `PORT` (3000): la LAN — el POS, el panel abierto en el local. Sin cambios.
- `PORT_REMOTO` (3001): **sólo el túnel**, atado a `127.0.0.1` y nunca abierto
  en el firewall. La configuración de `cloudflared` apunta acá.

Que un pedido haya entrado por ese socket es una señal **imposible de
falsificar**: no es un header que el cliente controle. Se descartó distinguir
el origen sólo por el `Host` justamente por eso — aunque el `Host` se usa como
señal secundaria, ver más abajo.

### 2. Lista blanca: por el túnel sólo pasa lo que el panel necesita

`RestriccionRemotaGuard` corre como guard **global y antes de la
autenticación**: lo que no está en la lista de `rutas-remotas.ts` se rechaza
con 403 sin siquiera mirar el token. Hoy la lista es exactamente lo que
consume `admin-web`:

| | |
| --- | --- |
| `POST /auth/login` | el único POST que pasa |
| `GET /health` | diagnóstico y la comprobación de alcanzabilidad |
| `GET /comercio/logo` | branding del panel |
| `GET /reportes/**` | todos los reportes, incluido el libro de ventas |

**Denegar por defecto** es deliberado: agregar un endpoint nuevo al servidor no
abre un agujero remoto sin que nadie se entere. El costo es el simétrico —
agregar una llamada nueva a `admin-web` sin tocar la lista rompe el panel
**sólo desde afuera del local**, que es el peor lugar para descubrirlo. Por eso
los tests enumeran uno por uno los endpoints del panel.

Con esto, el daño posible de una credencial robada baja de *"control total del
comercio"* a *"vio los reportes"*.

### 3. El `Host` como red de seguridad para instalaciones viejas

Un comercio que ya tenía el túnel configurado apuntando al puerto de la LAN
seguiría entrando por el 3000, y la restricción no se aplicaría: fallaría
**abierta**, que es el peor modo de fallar. Por eso el guard también trata
como remota cualquier petición cuyo `Host` coincida con el hostname público
del comercio (que lee del archivo de estado de ADR-0055).

Falsificar ese header desde la LAN sólo se auto-restringe: nunca otorga
permisos.

### 4. Auditoría de ingresos desde afuera

Un login que entra por el túnel deja un `RegistroAuditoria` con acción
`LOGIN_REMOTO`, el usuario y la IP real (que ADR-0052 ya resuelve con `trust
proxy`). Es *best-effort*: si la auditoría falla, el usuario entra igual — no
vale dejar a alguien afuera de su panel porque no se pudo escribir un registro.

Los intentos **bloqueados** quedan como `WARN` en el log del servidor, no en
auditoría: al rechazarse antes de autenticar no hay usuario ni sucursal que
asociarles, y `RegistroAuditoria` los exige.

## Consecuencias

### Positivas
- Una credencial robada ya no sirve para hacer daño desde afuera: sólo para
  mirar reportes que el dueño de todos modos quería ver desde el celular.
- Las lecturas peligrosas (credenciales de empleado, respaldos, el catálogo
  completo, la cola de sync) dejan de estar expuestas.
- El comercio no pierde nada: el panel hace exactamente lo mismo que antes.
- Cero fricción — no hay un paso más para el dueño, a diferencia de un segundo
  factor.
- El dueño puede ver quién entró desde afuera y cuándo.
- La misma app en dos puertos: no se duplica proceso, ni memoria, ni
  configuración.

### Negativas / costos
- **La lista blanca hay que mantenerla.** Una función nueva del panel que se
  olvide de actualizarla funciona en el local y falla desde afuera. Mitigado
  con tests que enumeran los endpoints del panel, pero es acoplamiento real
  entre `admin-web` y `cloud-api`.
- Un ADMIN legítimo **no puede administrar el sistema desde afuera**: para
  cambiar un precio o dar de alta un usuario hay que estar en el local. Es
  deliberado, y es la mitad del valor de esta decisión, pero es una función
  que alguien va a pedir en algún momento.
- Dos puertos en vez de uno: hay que mantener `PORT_REMOTO` alineado entre el
  `.env` del servidor y el `config.yml` del túnel. El instalador los escribe
  juntos; a mano se pueden desincronizar (el efecto sería que el túnel deje de
  responder, no que se abra de más).
- Los intentos bloqueados no quedan en la auditoría de la base, sólo en el log.

## Alternativas consideradas

- **Distinguir el origen sólo por el header `Host`** — mucho más simple, sin
  segundo listener. Descartada como señal *principal* porque es un dato que el
  cliente controla; quedó como red de seguridad secundaria (punto 3).
- **Permitir todos los `GET` y bloquear sólo las escrituras** — más cómodo y
  sin acoplamiento con `admin-web`, pero deja expuestas lecturas que no
  deberían salir del local: la credencial de empleado, los respaldos, el
  padrón completo de clientes. Denegar por defecto cuesta mantenimiento y lo
  vale.
- **Segundo factor (TOTP) para el acceso remoto** — más fuerte contra el robo
  de credenciales, pero le agrega fricción real al dueño (configurarlo y
  depender del teléfono) y no limita el daño una vez adentro. Es complementario,
  no alternativo: queda como opción para el comercio que la pida.
- **Cloudflare Access delante del panel** (OTP por mail antes de llegar a
  nuestro login) — lo más fuerte de todo, y descartado por lo mismo que en
  ADR-0055: es parte de Zero Trust, cuyo panel exige cargar una tarjeta de
  crédito aunque el plan sea gratuito.
- **No exponer nada y usar escritorio remoto** — es lo que hace buena parte del
  rubro, y es peor: expone la PC entera en vez de un panel de sólo lectura.
