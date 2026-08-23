# ADR-0056: Suscripción mensual — licencia firmada, tres avisos y panel de clientes

- **Estado:** Aceptada
- **Fecha:** 2026-08-22 (aceptada y corregida el 2026-08-23)
- **Decisores:** Equipo NexoSoft
- **Relacionada:** ADR-0055 (dominio y cuenta de Cloudflare de NexoSoft), ADR-0057
  (acceso remoto de solo lectura), ADR-0019 (servidor de sucursal en LAN),
  ADR-0004 (SQLite como fuente de verdad offline), ADR-0016 (puertos de
  repositorio), ADR-0040 (configuración desde la UI)

## Contexto

NexoSoft se vende como **suscripción mensual**, pero hoy no existe ninguna
pieza de software que lo sostenga: no sabemos qué comercios están al día, el
sistema no le avisa a nadie que se acerca el vencimiento, y si un cliente
deja de pagar no hay forma de cortar el servicio salvo pedírselo por
teléfono. Cada instalación que sale queda funcionando para siempre.

Lo que se pidió: un panel **nuestro** con todos los clientes por nombre,
donde se pueda mover el estado de la suscripción en tres escalones —
**recordatorio** (se acerca la fecha de pago), **advertencia** (venció, se
bloquea en los próximos días) y **bloqueo** (el POS abre pero no deja
operar).

Dos restricciones del proyecto condicionan todo el diseño:

- **Offline-first (CLAUDE.md §4, ADR-0004).** Vender, cobrar e imprimir no
  pueden depender de la red. Un control de licencia que consulte a un
  servidor nuestro en cada arranque convertiría nuestra disponibilidad en un
  punto único de falla para la caja de cada comercio.
- **La fuente de verdad del POS es su SQLite local.** El POS puede vender sin
  el `cloud-api`, así que un guard en el servidor no alcanza para frenar
  ventas: el bloqueo tiene que aplicarse también en el POS, con el último
  estado que conozca.

## Decisión

### 1. Infraestructura: Cloudflare Worker + KV en el dominio que ya tenemos

Sobre `nexosoft.com.ar` (ADR-0055), en la misma cuenta:

- `licencias.nexosoft.com.ar` — Worker que emite y firma las licencias. Lo
  consume el `cloud-api` de cada comercio.
- `admin.nexosoft.com.ar` — nuestro panel de clientes, **web y accesible
  desde cualquier lado**, servido por el mismo Worker.
- **KV** como base: un registro por comercio. Son decenas de comercios y
  lecturas de una vez por día — el plan gratuito sobra.

Sin servidor que mantener, sin costo mensual, y reusa el dominio y la cuenta
que ya existen.

**Por qué web y no una app de escritorio.** El servicio de licencias tiene
que ser remoto igual —el servidor de cada comercio necesita consultarlo—, así
que lo único que se elige es dónde vive la pantalla. Web gana porque: no hay
instalador ni pipeline de publicación ni **una segunda clave de firma que
cuidar** (ver ADR-0053 y lo que ya pesa la del POS); se abre desde el celular,
que es donde uno está cuando un cliente avisa un sábado a la noche que ya
pagó; y si se rompe nuestra PC, la lista de clientes sigue viva en KV.

**Cómo se protege el panel — no con Cloudflare Access.** La versión anterior
de esta ADR proponía Access, y quedó descartado por lo mismo que en ADR-0055:
es parte de Zero Trust, cuyo panel exige cargar una tarjeta de crédito aunque
el plan sea gratuito. En su lugar:

- **Token largo y aleatorio** en vez de usuario y contraseña: no hay nombre de
  usuario que adivinar ni contraseña que filtrar.
- **Segundo factor (TOTP) para las acciones peligrosas** — bloquear sí, mirar
  no.
- **Tope de seguridad**: el Worker se niega a bloquear más de un puñado de
  comercios por día sin una confirmación extra. Protege de un intruso y
  también de nuestro propio error.
- **Desbloquear es siempre inmediato y bloquear siempre reversible**: ante la
  duda, el sistema se equivoca para el lado de dejar trabajar al comercio.
- Toda acción del panel queda registrada.

Este panel puede dejar sin vender a todos los clientes a la vez: es el sistema
más sensible que vamos a tener, y se trata como tal.

### 2. Licencia firmada con ventana de gracia

El Worker emite un **token firmado con Ed25519** (clave privada solo como
secret del Worker; clave pública embebida en `cloud-api`, que no es secreta):

```jsonc
{
  "comercioId": "lagus",
  "estado": "ACTIVA | RECORDATORIO | ADVERTENCIA | BLOQUEADA",
  "vencePagoEl": "2026-09-10",        // fecha de pago de la suscripción
  "validaHasta": "2026-08-29T00:00Z", // vencimiento del TOKEN (7 días)
  "mensaje": "texto opcional a mostrar",
  "emitidaEn": "2026-08-22T00:00Z"
}
```

`validaHasta` corto es lo que hace que esto funcione offline: el `cloud-api`
renueva el token una vez por día (`@nestjs/schedule`, que ya se usa) y, si no
puede, **sigue operando con el token que tiene** hasta que expire.

### 3. Un corte de internet nunca bloquea a nadie

**El bloqueo solo puede venir de un token firmado que diga `BLOQUEADA`.**
Si el token expira sin poder renovarse, el sistema **no** escala a bloqueo:
se queda en `ADVERTENCIA` con un mensaje explícito ("no se pudo validar la
suscripción desde el <fecha>, comunicate con NexoSoft").

Esto deja una puerta abierta: un comercio que corte internet a propósito no
se bloquea nunca. Se acepta a conciencia. La alternativa —bloquear por falta
de contacto— significa que una caída de nuestro Worker, un DNS vencido o un
ISP con problemas dejan sin vender a todos los comercios al mismo tiempo, y
eso es un daño mucho peor y mucho más probable que un cliente evasor. Además
un comercio sin internet pierde el CAE de ARCA, así que el incentivo real a
hacerlo es bajo.

### 4. Qué hace cada estado

| Estado | POS | `cloud-api` |
| --- | --- | --- |
| `ACTIVA` | nada | nada |
| `RECORDATORIO` | banner suave: "tu pago vence el 10/09" | expone el estado |
| `ADVERTENCIA` | banner naranja fijo: "pago vencido, se bloquea el 20/09" | expone el estado |
| `BLOQUEADA` | pantalla de bloqueo con el contacto de NexoSoft | rechaza operaciones de escritura (HTTP 402) |

**Qué queda disponible en `BLOQUEADA`** (decidido el 2026-08-23; el pedido
original era "todas las funciones bloqueadas", y se optó por esto): se bloquea
**vender**, que es lo que hace efectivo el corte, y quedan habilitados

- **cerrar el turno de caja** que haya quedado abierto — si no, el bloqueo
  deja una caja abierta e inconsistente que después hay que arreglar a mano;
- **ver, exportar e imprimir lo histórico** (libro de ventas, comprobantes,
  cuentas corrientes) — son registros fiscales del comercio, no nuestros;
  retenerlos nos expone y no agrega presión de cobro real;
- **login y configuración**, para poder desbloquear cuando paguen.

### 5. Puerto + mock, como toda integración externa (CLAUDE.md §6)

`ProveedorLicencias` como interfaz, con dos implementaciones:
`LicenciasHttp` (el Worker) y `MockLicencias` (desarrollo y tests). Todo el
lado del cliente —estados, avisos, bloqueo, ventana de gracia— se puede
implementar y testear **antes** de que exista el Worker.

El paquete `@nexosoft/licencias` queda **puro y sin criptografía**: tipos,
reglas de estado y la ventana de gracia, nada más. La verificación de la firma
Ed25519 vive en `cloud-api` (`node:crypto`), porque el paquete también lo
consume el POS, que corre en un navegador donde `node:crypto` no existe. El
POS nunca verifica firmas: le pregunta a su servidor.

### 6. Identidad del comercio y alta

El `comercioId` lo asignamos nosotros en el alta y viaja en el mismo **código
de activación** de ADR-0055, que pasa a llevar `comercioId` + `hostname` +
`token` del túnel. Un solo código para el comercio, un solo momento de alta.

### 7. Heartbeat de soporte

Cuando un `cloud-api` pide su licencia, el Worker registra `ultimoContacto`,
la versión instalada y el `comercioId`. El panel muestra entonces quién está
vivo, quién quedó en una versión vieja y quién no se conecta hace días —
información de soporte que hoy no tenemos. **No viajan datos de ventas, ni
de clientes del comercio, ni nada del negocio**: solo identificador, versión
y fecha.

### 8. Esto es un mecanismo de cobro, no un DRM

Quien tenga acceso de administrador a la PC del comercio puede alterar el
SQLite o el binario y saltear el bloqueo. No se intenta evitar eso: el
objetivo es que un cliente **cooperativo** reciba avisos claros y que uno que
dejó de pagar no pueda seguir usando el sistema sin darse cuenta. Blindarlo
más costaría mucho y se rompería igual.

## Consecuencias

### Positivas
- Los tres escalones que se pidieron, automáticos: el sistema avisa solo y
  escala solo, sin que nadie tenga que acordarse de llamar.
- Cero infraestructura nueva que mantener y sin costo mensual.
- El panel además resuelve soporte: qué versión corre cada cliente y quién
  está desconectado.
- El lado cliente es testeable sin el Worker (mock), así que se puede
  implementar en una fase corta y aparte.
- Ninguna caída nuestra puede frenarle la caja a un comercio.

### Negativas / costos
- **Un comercio sin internet no se bloquea nunca.** Aceptado a conciencia
  (punto 3).
- Bloquear la caja de un comercio es una acción con consecuencias reales
  sobre gente trabajando: exige un procedimiento claro de aviso previo y una
  forma de desbloquear en minutos cuando pagan (el panel lo hace, pero el
  cliente necesita internet para recibir el token nuevo).
- Aparece un dato nuevo que somos responsables de custodiar: la lista de
  clientes con sus estados de pago.
- La clave privada de firma es un secreto crítico: si se filtra, cualquiera
  emite licencias; si se pierde, hay que rotar la pública en todos los
  clientes con una actualización de servidor.
- El `cloud-api` pasa a tener una dependencia externa nueva (nuestro Worker),
  aunque degradada y no bloqueante.

## Alternativas consideradas

- **Licencia por archivo firmado, sin ningún servidor** (se la mandamos por
  WhatsApp cada mes) — cero infraestructura, pero la renovación es manual
  para nosotros *y* para el cliente, todos los meses, con cada comercio. No
  escala más allá de un puñado de clientes.
- **VPS propio con la API de licencias y el panel** — más control, pero hay
  que pagarlo, mantenerlo, actualizarlo y asegurarlo, para algo que un Worker
  gratuito resuelve.
- **Chequeo online obligatorio en cada arranque del POS** — el control más
  estricto, y el que rompe frontalmente el offline-first (ADR-0004): sin
  internet no se abre la caja. Descartado sin discusión.
- **Bloquear por falta de contacto** (si no pudo validar en N días, bloquea)
  — cierra la puerta del punto 3, pero convierte cualquier problema de red
  nuestro o del comercio en una caja parada. El riesgo no compensa.
- **No bloquear nunca, solo avisar** — más simple y sin ninguno de los
  riesgos de arriba, pero deja el cobro apoyado únicamente en la buena
  voluntad, que es justamente el problema que se quiere resolver.

## Plan sugerido (si se aprueba)

1. **17.B.1 — lado cliente, con mock.** Contrato de la licencia, puerto
   `ProveedorLicencias` + `MockLicencias`, estados, ventana de gracia,
   banners de recordatorio/advertencia y pantalla de bloqueo en el POS,
   guard de escritura en `cloud-api`. Con tests. Sin nada desplegado.
2. **17.B.2 — Worker + panel.** Emisión firmada, KV, heartbeat, panel en
   `admin.nexosoft.com.ar` detrás de Cloudflare Access.
3. **17.B.3 — alta automática.** Que dar de alta un comercio desde el panel
   cree también el túnel y el subdominio de ADR-0055 vía API de Cloudflare,
   y genere el código de activación.
