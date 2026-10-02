# ADR-0085: Domicilio, Ingresos Brutos e inicio de actividades en el encabezado

- **Estado:** Aceptada
- **Fecha:** 2026-10-02
- **Decisores:** Equipo NexoSoft
- **Relacionada:** ADR-0079 (Transparencia Fiscal), ADR-0083 y ADR-0084
  (Factura A y el papel que coincide con ARCA), ADR-0012 (condición fiscal del
  emisor configurable)

## Contexto

El encabezado del comprobante imprimía **razón social, CUIT y condición frente
al IVA**, y nada más. La RG 1415 pide además, para cualquier comprobante:

- **domicilio comercial** del emisor,
- **número de inscripción en Ingresos Brutos**,
- **fecha de inicio de actividades**.

No es que estuvieran cargados y no se imprimieran: **no existían en ningún
lado**. La configuración del comercio tenía `cuit`, `razonSocial`,
`puntoDeVenta`, `condicionIvaEmisor` y el entorno de ARCA.

Apareció al revisar un relevamiento normativo externo contra el código, no en
una prueba de campo: trece vueltas de pruebas con comprobantes reales no lo
detectaron, porque lo que falta en un papel no salta a la vista como lo que
está mal.

**Qué NO es esto.** El checklist ya tenía anotado "Ingresos Brutos en el
comprobante", pero eso es el régimen de transparencia **provincial**, que pide
la **alícuota** de IIBB y está postergado hasta 2027 en casi todo el país. Esto
es otra cosa: el **número de inscripción** del emisor, en el encabezado, y rige
desde siempre. Se llaman parecido y no tienen nada que ver.

## Decisión

### 1. Son datos del POS, no del servidor

Van en `ConfiguracionComercio` y en la tabla `comercio_config` del SQLite local,
no en el servidor.

El resto de los datos fiscales se copia al `cloud-api` por un motivo concreto:
**es el servidor el que habla con ARCA**, y la numeración se rompería si cada
terminal tuviera su punto de venta. Estos tres no entran en esa categoría —
ARCA ya los tiene del padrón y no viajan en el `FECAESolicitar`—, así que
agregarlos al servidor sería crear columnas que nadie lee.

Costo asumido: dos terminales con copias distintas imprimirían encabezados
distintos. Es el mismo riesgo que ya corre el logo, y se resuelve cargándolos
una vez por instalación.

### 2. Opcionales, y lo que falta no se imprime

Las tres columnas son nullables y los tres campos del tipo son opcionales. Una
instalación anterior a esta fase las gana vacías con un `ALTER TABLE` y sigue
funcionando.

**Un comprobante sin estos datos está mal emitido, pero frenar la caja de un
comercio que ya venía operando sería peor.** Se imprime lo que haya, cada
renglón se omite si falta —un renglón en blanco en el papel es peor que
ninguno— y la pantalla de Configuración los pide. Mismo criterio que el resto
del sistema: ante la duda, se deja trabajar.

### 3. Un solo lugar arma los renglones

`renglonesDelEmisor()` vive en `@nexosoft/hardware`, al lado de las otras
decisiones de impresión, y la usan **los tres renderers**: el A4, el ticket HTML
y la térmica ESC/POS.

No es una preferencia de estilo. Cuando cada renderer decidió algo por su
cuenta terminamos con un original que decía "IVA 0%" y un duplicado que decía
"Exento" sobre la misma Factura A (ADR-0084). El texto, el orden y el formato
de la fecha se deciden una vez.

Del lado del POS, `cabeceraDelEmisor()` hace lo propio con la configuración:
los dos lugares que construyen un ticket —la venta nueva y la reimpresión—
sacan de ahí el logo y estos tres campos, para que no pueda olvidarse en uno.

### 4. La fecha se formatea sin `Date`

`fechaCorta("2019-03-15")` → `15/03/2019`, por manipulación de texto. Una fecha
sin hora convertida a `Date` se interpreta como medianoche UTC y en Argentina
se muestra como el día anterior. Ya nos pasó con las fechas de la licencia.

## Consecuencias

### Positivas
- El encabezado cumple con la RG 1415, que es condición para que el comprobante
  esté bien emitido.
- Los tres renderers no pueden discrepar: comparten la función.
- Ninguna instalación existente se rompe ni necesita intervención.

### Negativas / costos
- **Los comercios ya instalados tienen que entrar a Configuración y
  cargarlos.** No hay forma de adivinarlos: el domicilio y el número de IIBB no
  están en ningún dato que tengamos. Va en el instructivo de instalación, que
  ya está pendiente de reescribirse.
- En la térmica de 58mm el renglón del inicio de actividades no entra en una
  línea y se parte en dos. Es legible y correcto, pero son dos líneas más de
  papel por ticket.
- Un dato más por terminal que puede quedar desactualizado si el comercio se
  muda y nadie lo cambia.

## Alternativas consideradas

- **Guardarlos también en el servidor**, como el resto de los datos fiscales —
  descartado: el servidor no los usa para nada. Si algún día hiciera falta
  centralizarlos (multisucursal, o un reporte que los necesite), se agregan
  entonces con el motivo a la vista.
- **Exigirlos para poder facturar**, bloqueando la venta hasta cargarlos — se
  descartó por lo mismo que en el punto 2: deja sin vender a un comercio que
  venía andando, por un dato que se carga en diez segundos pero que nadie sabe
  que falta hasta que el POS no abre.
- **Que cada renderer los imprima a su manera**, aprovechando que el A4 tiene
  más espacio que la térmica — es exactamente lo que produjo el problema del
  original y el duplicado distintos (ADR-0084).
