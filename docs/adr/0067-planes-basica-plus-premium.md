# ADR-0067: Planes Básica, Plus y Premium — el plan viaja en la licencia firmada

- **Estado:** Aceptada
- **Fecha:** 2026-09-03
- **Decisores:** Equipo NexoSoft (decisión del usuario)
- **Relacionada:** ADR-0056 (suscripción mensual y panel de clientes), ADR-0025
  (shell de gestión en el POS), ADR-0039 (asistente IA), ADR-0052 y ADR-0057
  (acceso remoto), ADR-0020 (respaldo en nube propia)

## Contexto

Hoy toda instalación tiene **todo**. El único eje comercial que existe es
binario: el comercio está al día o está bloqueado (ADR-0056). No hay forma de
vender un sistema más chico a un comercio chico, ni de cobrar más por lo que
cuesta más construir.

Se decidió vender en **tres planes**: Básica, Plus y Premium. Al 2026-09-03 los
precios de lista son USD 50, 75 y 100 mensuales, pero eso es un dato comercial
que cambia — ver §5, el código no los conoce.

La pregunta de diseño no es "cómo escondemos módulos": es **dónde vive la
verdad sobre qué plan tiene un comercio**, y qué pasa cuando esa verdad no
llega.

## Decisión

### 1. El plan viaja en el token firmado, al lado del estado

`Licencia` gana un campo `plan`:

```jsonc
{
  "comercioId": "lagus",
  "estado": "ACTIVA",
  "plan": "BASICA | PLUS | PREMIUM",
  "vencePagoEl": "2026-10-10",
  "validaHasta": "2026-09-10T00:00Z",
  "emitidaEn": "2026-09-03T00:00Z"
}
```

Mismo Worker, misma firma Ed25519, misma renovación cada 5 minutos, mismo
caché en la base del comercio que ya sobrevive a los cortes de internet. **Cero
infraestructura nueva.**

Lo importante es lo que esto descarta: el plan **no** es un campo editable en
la base del comercio. Si viviera ahí, cualquiera con acceso al Postgres de la
PC de Caja se asciende a Premium editando una fila. Firmado por nosotros, no.
Sigue siendo un mecanismo de cobro y no un DRM (ADR-0056 §8) — quien quiera
romperlo va a poder —, pero no puede ser un accidente ni un descuido.

### 2. Una licencia sin `plan` es Premium, no Básica

Los comercios ya instalados tienen tokens sin este campo, y el Worker puede
tardar en emitir uno nuevo. Si la ausencia se interpretara como Básica, una
demora nuestra le apagaría módulos a un cliente que los tiene pagos.

**Ante la duda, el sistema se equivoca para el lado de dejar trabajar.** Es la
misma regla que hace que un corte de internet no bloquee a nadie (ADR-0056 §3),
aplicada al plan.

### 3. Dos capas de gateo, y sólo una manda

- **`cloud-api`: lista blanca de escrituras por plan**, hermana de
  `operaciones-bloqueadas.ts`. Es la autoridad. Lo que no está permitido para
  el plan se rechaza con HTTP 402, igual que el bloqueo.
- **POS: `planMinimo` por módulo** en `shell/modulos.tsx`, que ya gatea por rol.
  Es UX, no seguridad — exactamente el mismo criterio que el gateo por rol
  documentado ahí (CLAUDE.md §5: validar en el backend, no sólo en la UI).

### 4. La UI no esconde: muestra con candado

Un módulo fuera del plan **se ve en el menú**, en gris, con la leyenda
"Disponible en Plus". No se oculta.

Esto es una decisión comercial disfrazada de UX: si Básica esconde Reportes, el
comercio nunca se entera de que existe y nunca lo va a comprar. El gateo pasa a
ser el canal de venta en vez de un muro.

### 5. El código no sabe de precios

El binario conoce **tres nombres de plan y qué módulo entra en cada uno**. Nada
más. Los precios viven en el registro KV de cada comercio, y se guardan **por
comercio, no por plan**: el plan aporta el precio de lista como valor inicial y
el panel lo deja pisar. El primer cliente siempre tiene precio de primer
cliente, y eso no puede requerir un despliegue.

Se guardan `moneda` + `importe`, no un número suelto: "USD 50" en Argentina no
es un precio, es una pregunta (qué dólar, y en qué se paga). Como el cobro es
manual —no hay pasarela de suscripción, ADR-0056 no la incluyó—, el panel
**registra** lo acordado, no lo ejecuta.

### 6. Bajar de plan no borra ni esconde nada

Se pierde **crear cosas nuevas**, nunca ver ni exportar lo que ya existe. Un
comercio que usó Cuentas Corrientes en Plus y baja a Básica sigue viendo sus
saldos y puede exportarlos; lo que no puede es registrar movimientos nuevos.

Es el mismo principio que ya rige el bloqueo por falta de pago con los
registros fiscales (ADR-0056 §4): son datos del comercio, no nuestros.
Retenerlos nos expone y no agrega presión de cobro real.

### 7. Qué entra en cada plan

| Plan | Módulos | La idea |
| --- | --- | --- |
| **Básica** | Inicio, Punto de Venta, Caja y Tesorería, Comprobantes (ARCA, notas de crédito y débito), Catálogo y Precios, **Stock e Inventario**, Usuarios, Configuración | *Vendo, facturo y sé lo que tengo.* |
| **Plus** | todo lo anterior + Cuentas Corrientes, Presupuestos, Remitos, Proveedores, Medios de pago con tasas, Etiquetas de góndola, Reportes y Estadísticas | *Además gestiono clientes, deuda y papeles.* |
| **Premium** | todo lo anterior + Asistente IA, acceso remoto al panel web, respaldo en nube propia, y el módulo contable cuando exista | *Miro el negocio desde afuera.* |

Notas sobre los bordes:

- **Stock quedó en Básica** por decisión del usuario (2026-09-03): un comercio
  que no sabe lo que tiene no está usando un sistema, está usando una
  calculadora.
- **El Asistente IA está en Premium por valor, no por costo.** No nos cuesta
  plata: cada comercio pone su propia `GEMINI_API_KEY` y le alcanza el free
  tier de Google (ADR-0039 §1, ADR-0040). Consecuencia práctica: vender Premium
  **por** la IA implica que el alta de Premium incluye generarle la clave en AI
  Studio; no se le puede dejar ese paso al dueño del comercio. Y el free tier
  tiene tope por minuto y por día: un 429 en hora pico, en un plan pago, es un
  reclamo.
- **El módulo contable todavía no existe.** Queda anotado acá para que la tabla
  no haya que rediscutirla cuando llegue.

## Consecuencias

### Positivas
- Un eje comercial real, sin infraestructura nueva ni un segundo canal que
  mantener: el plan usa el mismo token, la misma firma y el mismo caché offline
  que el estado de suscripción.
- El plan no se puede editar desde la PC del comercio.
- El gateo con candado convierte cada módulo no comprado en una oferta visible.
- Bajar de plan es seguro: ningún dato se pierde, así que un cambio de plan
  nunca es una decisión irreversible para el comercio.

### Negativas / costos
- **Aparece una lista blanca más que mantener.** Igual que la de ADR-0057 y la
  del bloqueo: un módulo nuevo que no se agregue a la tabla queda accesible
  para todos los planes. Se mitiga con un test que recorre `MODULOS` y exige
  que cada uno declare su `planMinimo`.
- Dos lugares que dicen lo mismo (backend y POS) y pueden desincronizarse. Se
  acepta por la misma razón que en el gateo por rol: la UI necesita la
  respuesta antes de pedirle nada al servidor.
- El precio deja de estar en un solo lugar conocido y pasa a ser un dato por
  comercio. Es lo correcto, pero exige que el panel lo muestre bien: si no se
  ve de un vistazo qué le cobrás a cada uno, se convierte en un Excel paralelo.
- Un comercio con el token vencido y sin internet queda operando con el plan
  que tenía. Es deliberado (§2) y coherente con ADR-0056 §3.

## Alternativas consideradas

- **Flags por módulo en vez de tres planes** (vender cualquier combinación a
  medida) — más flexible, y descartado por ahora: tres nombres se explican en
  una frase y se ponen en una lista de precios; veinte flags no se venden ni se
  soportan. El registro KV puede ganar un `modulosExtra` más adelante sin
  romper nada, si aparece el caso real de un comercio que quiere un solo módulo
  suelto.
- **El plan como campo en la configuración del comercio** (una fila en su
  Postgres) — más simple, y descartado: se asciende de plan editando una fila.
- **Un build distinto por plan** — el gateo más hermético, y el peor de
  mantener: tres instaladores, tres pipelines de release y una migración manual
  cada vez que un cliente cambia de plan. El sistema ya se actualiza solo
  (ADR-0053); romper eso por el gateo sería cambiar un problema grande por uno
  chico.
- **Bloquear el módulo escondiéndolo del menú** — descartado en §4.
