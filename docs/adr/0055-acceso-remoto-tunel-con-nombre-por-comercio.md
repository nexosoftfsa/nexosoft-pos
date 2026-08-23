# ADR-0055: Acceso remoto con un túnel con nombre y subdominio fijo por comercio

- **Estado:** Aceptada
- **Fecha:** 2026-08-22
- **Decisores:** Equipo NexoSoft
- **Relacionada:** ADR-0052 (acceso remoto vía Cloudflare Tunnel: la reemplaza
  en la parte operativa, no en los prerrequisitos de seguridad), ADR-0019
  (servidor de sucursal en LAN), ADR-0053 (script elevado con scope fijo
  disparado desde el POS), ADR-0024 (panel web de reportes)

## Contexto

ADR-0052 dejó `admin-web` listo para exponerse a internet, pero el
procedimiento era **por comercio y a mano**: cuenta de Cloudflare propia del
comercio, dominio propio del comercio, `cloudflared tunnel login`, archivo de
credenciales, `config.yml`, ruta DNS y `cloudflared service install`. Nueve
pasos técnicos por venta, y cada comercio tenía que comprar y mantener un
dominio. En la práctica no se hizo en ningún cliente.

La Fase 17 arrancó buscando esquivar eso con un **túnel efímero**
(`cloudflared tunnel --url`, direcciones `*.trycloudflare.com`): sin cuenta,
sin dominio, sin credenciales, levantado solo al iniciar Windows. Se llegó a
implementar el supervisor, y el problema de fondo quedó claro: la dirección
**cambia en cada arranque del túnel**. El dueño no puede guardar el favorito
ni compartir el link con su contador; cada vez que se reinicia la PC tiene
que ir al POS a escanear un QR nuevo. Además Cloudflare no da ninguna
garantía sobre los quick tunnels (sin SLA, pensados para pruebas).

A mitad de la fase apareció el dato que cambia el análisis: **NexoSoft ya
tiene `nexosoft.com.ar` en Cloudflare**. Con un dominio propio, el túnel con
nombre deja de ser "nueve pasos por comercio" y pasa a ser trabajo nuestro,
una vez, en nuestra cuenta.

## Decisión

Cada comercio tiene un **subdominio fijo de primer nivel** bajo el dominio de
NexoSoft (`https://<comercio>.nexosoft.com.ar`), atendido por un **túnel con
nombre** creado por nosotros en **nuestra** cuenta de Cloudflare. En la PC del
comercio no hay dominio, ni certificado, ni credenciales de Cloudflare.

1. **Túnel gestionado por línea de comandos, no desde el dashboard.**
   `cloudflared tunnel login` una sola vez en nuestra PC, y después un
   comando por comercio (`generar-codigo-acceso-remoto.ps1`, que crea el
   túnel, apunta el CNAME y arma el código). **Esto evita Cloudflare Zero
   Trust**, cuyo panel pide cargar una tarjeta de crédito aunque el plan sea
   gratuito — fricción innecesaria y un medio de pago cargado a cambio de un
   dashboard que casi no usamos. `cloudflared tunnel list` e `info` dan la
   misma información desde la consola. Cuando exista el panel de gestión de
   clientes (ADR-0056), este alta se automatiza con la API de Cloudflare.
2. **Un solo dato viaja a la PC del comercio: el "código de activación"**,
   que es el hostname + el id del túnel + su archivo de credenciales
   empaquetados en base64 (~350 caracteres). Se pega en la pantalla del
   instalador o en el POS (Configuración → Acceso remoto). No es un secreto
   cifrado: es un envoltorio para que el dueño copie **una sola cosa**.
3. **Tarea programada de Windows** (`NexoSoft Acceso Remoto`) que corre
   `cloudflared --config <ruta> tunnel run`: arranca sola al prender la PC y
   se reinicia sola si se cae, igual que las tareas del `cloud-api` y de
   PostgreSQL de esta misma instalación. Se prefirió a `cloudflared service
   install` para poder apuntar al `config.yml` con una **ruta explícita**, en
   vez de depender de dónde busca `cloudflared` su configuración cuando corre
   como SYSTEM. No hay supervisor propio nuestro: la tarea ejecuta
   `cloudflared` directamente.
4. **Los secretos separados de lo mostrable**, en `C:\ProgramData\NexoSoft\`:
   `cloudflared\<id>.json` tiene las **credenciales del túnel** y queda con
   ACL cerrada (SYSTEM + Administradores, por SID); `acceso-remoto.json`
   tiene solo lo mostrable (dirección, estado) y es lo único que lee
   `cloud-api`. Las credenciales no pueden salir por la API ni por accidente.
5. **`GET /api/v1/acceso-remoto`** (ADMIN/SUPERVISOR) devuelve la dirección y,
   además, **prueba la vuelta completa** pegándole a su propio `/health` **por
   el hostname público** (sale a internet, pasa por Cloudflare y vuelve por el
   túnel), con caché de 30 s. Distingue "el servicio está arriba" de "el dueño
   lo va a poder abrir desde el celular", que es lo que realmente importa.
6. **El POS muestra la dirección con un QR** (Configuración → Acceso remoto) y
   ofrece activar / desactivar / reactivar mediante el script elevado, mismo
   patrón que "Actualizar servidor" (ADR-0053).

**Sin código de activación no hay acceso remoto**: una instalación que no lo
tenga muestra "no configurado" y el panel se ve solo desde la LAN. No hay
mecanismo de respaldo con túnel efímero — un solo camino que mantener y
probar, y ningún servidor expuesto a internet sin que lo demos de alta
nosotros.

### Excepción deliberada a los argumentos 100% fijos de ADR-0053

ADR-0053 fijó que el POS solo puede ejecutar comandos con argumentos fijos en
tiempo de compilación. El código de activación es el **único** dato dinámico
que el frontend le pasa a un comando, y va detrás de un `validator` de Tauri
que solo acepta `[A-Za-z0-9+/=]{20,4096}`: sin comillas, espacios, `;`, `$` ni
backticks, no hay forma de que se escape del `'...'` donde queda embebido en
la línea de PowerShell. La alternativa (que el dueño abra PowerShell, o que
haya que hacer una sesión remota para cada alta) es peor en la práctica y no
más segura. Un test verifica que el validador rechace cada uno de esos
caracteres.

## Consecuencias

### Positivas
- La dirección es **fija y memorizable**: el dueño la guarda en favoritos una
  vez y la comparte con su contador. Era el defecto que hundía al túnel
  efímero.
- El alta en la PC del cliente es **pegar un código**, algo que se puede
  guiar por teléfono con un dueño no técnico. Antes eran nueve pasos
  técnicos; ahora ninguno del lado del comercio.
- El comercio **no compra ni mantiene un dominio**, y no necesita cuenta de
  Cloudflare. El costo de infraestructura es un dominio nuestro que ya
  tenemos.
- **Ni siquiera nosotros necesitamos Zero Trust**, así que no hay que
  cargarle una tarjeta de crédito a Cloudflare para levantar esto.
- El alta de un comercio es **un comando** (`generar-codigo-acceso-remoto.ps1
  -Subdominio lagus`), no una secuencia de clics en un dashboard: es
  repetible, se puede documentar exacto y más adelante se automatiza.
- Sin supervisor propio: la tarea programada ejecuta `cloudflared` directo.
  Menos código nuestro corriendo como SYSTEM.
- El chequeo de alcanzabilidad prueba el camino real, no un proxy del camino.
- Prepara el terreno para ADR-0056: mismo dominio y misma cuenta para el
  panel de gestión de clientes.

### Negativas / costos
- **Somos responsables de la disponibilidad del dominio.** Si `nexosoft.com.ar`
  vence o se rompe el DNS, se cae el acceso remoto de *todos* los comercios a
  la vez. Antes cada uno dependía de su propio dominio. Mitigación operativa:
  renovación automática del dominio y monitoreo, fuera del alcance de esta
  fase.
- El alta por comercio sigue siendo **un paso manual nuestro** (correr el
  script) hasta que exista el panel de ADR-0056.
- **`cert.pem` pasa a ser un secreto crítico nuestro**: con él se crean y
  borran túneles y se toca el DNS de todo el dominio. Vive solo en el perfil
  de Windows de quien hace las altas, nunca en el repo ni en una PC de
  cliente. Si se pierde, se rehace con `cloudflared tunnel login`; si se
  filtra, hay que revocarlo desde Cloudflare.
- Las credenciales del túnel viven en la PC del comercio (lo requiere
  `cloudflared`): quien tenga administrador de esa PC las puede leer. Alcance
  real: levantar *ese* túnel, que apunta a *ese* servidor — no dan acceso al
  dominio ni a los otros comercios. Se revocan borrando el túnel
  (`cloudflared tunnel delete`).
- Sin el dashboard de Zero Trust no hay una pantalla con el estado de todos
  los túneles; hay que usar `cloudflared tunnel list` / `info`, o esperar al
  panel de ADR-0056.
- Solo un nivel de subdominio (`lagus.nexosoft.com.ar`, no
  `panel.lagus.nexosoft.com.ar`): el certificado universal gratuito no cubre
  el segundo nivel. Validado en el script, en el POS y en los tests.
- Un cliente que ya tenía servidor instalado necesita el instalador nuevo (o
  que le copiemos `instalar-acceso-remoto.ps1`) para tener el botón en el POS.

## Alternativas consideradas

- **Túnel efímero (`trycloudflare.com`) levantado al iniciar Windows** — es
  con lo que arrancó la fase y se llegó a implementar. Descartado al aparecer
  el dominio propio: la dirección cambia en cada arranque, no se puede
  guardar en favoritos, y Cloudflare no da garantías sobre esos túneles. Se
  evaluó dejarlo como respaldo para instalaciones sin token y se descartó
  también: dos mecanismos que mantener y probar para un caso que se resuelve
  dando de alta al cliente.
- **Túnel gestionado desde el dashboard de Cloudflare Zero Trust** (con
  connector token, que fue la primera implementación de esta misma fase) —
  descartado al descubrir que el panel de Zero Trust **exige cargar una
  tarjeta de crédito** aunque el plan sea gratuito hasta 50 usuarios. Es una
  verificación anti-abuso legítima, no un cobro encubierto, pero no hay razón
  para dar un medio de pago a cambio de un dashboard que apenas usábamos: el
  modo por línea de comandos da exactamente el mismo resultado con una cuenta
  común. El código de activación cambió de contenido (credenciales en vez de
  token) pero **la experiencia del comercio quedó idéntica**: pegar un código.
- **Túnel con nombre pero con dominio del comercio** (lo de ADR-0052) —
  descartado: repite toda la configuración por venta y le exige al comercio
  comprar y mantener un dominio.
- **Redirector estable propio** (`panel.nexosoft.com.ar/<comercio>` → 302 a
  la dirección efímera vigente, con un Worker + KV) — resolvía el favorito
  sin túnel con nombre, pero mete un componente nuestro en el camino crítico
  de cada acceso y sigue apoyado en túneles sin garantías. Con dominio propio,
  el túnel con nombre logra lo mismo con menos piezas.
- **Automatizar el alta con la API de Cloudflare desde el instalador** —
  descartado por ahora: exigiría un API token de Cloudflare con permisos
  sobre toda la zona en la PC de cada cliente, un secreto muchísimo más
  peligroso que las credenciales de un túnel suelto. Cuando esto se
  automatice (ADR-0056), ese token vive en nuestro servicio central, nunca en
  la PC del comercio.
