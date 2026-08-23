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

1. **Alta por comercio, manual por ahora** (Cloudflare Zero Trust: crear el
   túnel, agregar el public hostname → `http://localhost:3000`). Dos minutos
   por cliente. Ver `docs/acceso-remoto-cloudflare.md`. Cuando exista el
   panel de gestión de clientes (ADR-0056) este alta se automatiza con la API
   de Cloudflare desde ahí.
2. **Un solo dato viaja a la PC del comercio: el "código de activación"**,
   que es el hostname + el connector token del túnel empaquetados en base64
   (`scripts/release/generar-codigo-acceso-remoto.ps1`). Se pega en la
   pantalla del instalador o en el POS (Configuración → Acceso remoto). No es
   un secreto cifrado: es un envoltorio para que el dueño copie **una sola
   cosa** y no un token de 300 caracteres más un hostname aparte.
3. **`cloudflared service install <token>`**: queda un servicio de Windows
   real, que arranca solo al prender la PC y se reinicia solo si se cae. No
   hay supervisor propio nuestro — se descartó el que se había escrito para
   el túnel efímero.
4. **Dos archivos, dos públicos**, en `C:\ProgramData\NexoSoft\`:
   `acceso-remoto-config.json` tiene el **token** y queda con ACL cerrada
   (SYSTEM + Administradores, por SID); `acceso-remoto.json` tiene solo lo
   mostrable (dirección, estado) y es lo único que lee `cloud-api`. El token
   no puede salir por la API ni por accidente.
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
- Sin supervisor propio: el servicio de Windows de `cloudflared` ya resuelve
  arranque automático y reinicio ante caídas. Menos código nuestro corriendo
  como SYSTEM.
- El chequeo de alcanzabilidad prueba el camino real, no un proxy del camino.
- Prepara el terreno para ADR-0056: mismo dominio y misma cuenta para el
  panel de gestión de clientes.

### Negativas / costos
- **Somos responsables de la disponibilidad del dominio.** Si `nexosoft.com.ar`
  vence o se rompe el DNS, se cae el acceso remoto de *todos* los comercios a
  la vez. Antes cada uno dependía de su propio dominio. Mitigación operativa:
  renovación automática del dominio y monitoreo, fuera del alcance de esta
  fase.
- El alta por comercio sigue siendo **manual en Cloudflare** hasta que exista
  el panel de ADR-0056.
- El connector token vive en la PC del comercio (lo requiere `cloudflared`) y
  además queda en el `ImagePath` del servicio: quien tenga administrador de
  esa PC lo puede leer. Alcance real del token: levantar *ese* túnel, que
  apunta a *ese* servidor. Se revoca borrando el túnel en Cloudflare.
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
  peligroso que el connector token de un túnel. Cuando esto se automatice
  (ADR-0056), el API token vive en nuestro servicio central, nunca en la PC
  del comercio.
