# ADR-0071 — Un certificado de ARCA por entorno

Fecha: 2026-09-04
Estado: aceptado

## Contexto

La prueba de Facturas A y B del 4/9/2026 falló entera. ARCA rechazó las cinco
Facturas A, las dos B y las dos Notas de Débito. El motivo, que había que ir a
buscar tocando el badge rojo de Comprobantes:

> ARCA rechazó la autenticación: **Certificado no emitido por AC de confianza**

No es un problema de las Facturas A. **El comprobante nunca llegó a armarse**:
se cortó antes, en WSAA, al autenticar. Las Notas de Crédito C emitidas esa
misma mañana a las 12:57 habían salido perfectas.

Lo que cambió entre las 12:57 y las 13:44 fue el entorno. El instructivo
`PRUEBA-FACTURA-A-B-Y-ND.txt` decía, con razón, que había que pasar a
homologación —el CUIT de Sebastián figura como Monotributo en el padrón, así que
producción no autoriza una A ni una B— y no decía nada del certificado.

**ARCA tiene dos autoridades certificantes, una por entorno, y no se reconocen
entre sí.** El certificado de producción es inválido en homologación y al revés.
Su mensaje no menciona entornos: habla de una autoridad de confianza, que suena
a problema de criptografía o de cadena de certificados.

Nuestro almacenamiento tenía un solo archivo:

    secrets/arca/<cuit>/certificado.crt

Así que al pasar a homologación se seguía firmando con el de producción. Peor:
cargar el de homologación habría **pisado** el de producción, y al volver el
comercio se quedaba sin poder facturar de verdad.

Y la pantalla empujaba justo a la salida equivocada. Sin certificado para el
entorno activo caía en el instructivo de tres pasos, cuyo primer botón —con una
clave ya existente— dice "Generar de nuevo": eso **regenera la clave privada** y
deja inservibles los dos certificados. Para arreglar un problema de cinco
minutos, el camino a la vista era el que obliga a rehacer el trámite entero.

## Decisión

### El certificado se guarda por entorno; la clave, no

    secrets/arca/<cuit>/
      privada.key                     compartida
      pedido.csr                      compartido
      alias.txt                       compartido
      certificado.crt                 ← PRODUCCIÓN
      certificado-homologacion.crt    ← HOMOLOGACIÓN
      ticket-produccion.json
      ticket-homologacion.json

La clave y el pedido son del CUIT y no del entorno: ARCA emite los dos
certificados a partir del **mismo CSR**. Eso también quiere decir que pasar de
un entorno al otro no obliga a generar nada nuevo — sólo a hacer el trámite en
el portal que corresponde.

El de producción conserva el nombre de siempre, `certificado.crt`, sin sufijo.
Es a propósito: todo comercio ya instalado tiene ese archivo y es el de
producción. Renombrarlo obligaría a migrar carpetas que están fuera del repo y
que el comercio respalda a mano, y una actualización que se equivoque ahí lo
deja sin facturar. La asimetría en el nombre es más barata que esa migración.

### El entorno del certificado es el entorno activo del comercio

`PUT /fiscal/certificado` acepta `entorno`, pero si no viene usa el que el
comercio tiene configurado. Es lo que uno quiere siempre: se carga el
certificado del entorno en el que se está parado. La pantalla lo dice en texto
antes de subir el archivo, así que no hay ambigüedad.

### Se avisa antes, en tres lugares

1. **Al cambiar de entorno**, si el de destino no tiene certificado, el aviso lo
   dice antes de confirmar. Es el momento en que se puede evitar todo.
2. **En "Probar conexión con ARCA"**, el paso Certificado distingue "falta el
   trámite" de "el trámite está hecho, pero para el otro entorno" — que se
   arreglan de maneras muy distintas.
3. **En el error de WSAA**, traduciendo el mensaje de ARCA a uno que nombre el
   entorno, y conservando el texto original entre comillas para poder buscarlo.

### La pantalla ya no ofrece regenerar cuando falta sólo el certificado

Si hay clave y falta el certificado de este entorno pero existe el del otro, se
muestra un camino propio: no generes un pedido nuevo, subí el `.csr` que ya
tenés al portal del entorno que falta. El botón que regenera la clave no
aparece en ese estado.

### Se rechaza guardar como producción un certificado de homologación

La AC de homologación se nombra a sí misma en el emisor, así que esa dirección
se puede detectar y se bloquea. Al revés no hay marca confiable —la de
producción no dice "producción"— y no se inventa una: un aviso falso ahí haría
dudar del archivo correcto.

## Consecuencias

- La prueba de Facturas A y B **nunca ejecutó el código que iba a probar**. Todo
  lo de ADR-0069 y ADR-0070 sigue sin verificarse en campo.
- Un comercio puede tener los dos certificados cargados y alternar entre
  entornos sin trámite. Antes cada cambio pedía volver a subir un archivo.
- La hipótesis que veníamos manejando —que el rechazo era por el producto
  cargado como EXENTO, con `ImpNeto = 0`— **no era la causa**. El problema de
  EXENTO existe igual y sigue anotado, pero es otra cosa y no bloquea nada
  todavía.

## Lo que se hizo mal

El instructivo mandó a cambiar de entorno sin decir que el certificado también
cambia, y el sistema lo permitió sin chistar. Las dos mitades del mismo error:
**un cambio de configuración que invalida en silencio otra configuración no
puede depender de que alguien se acuerde.**

Es la tercera vez en esta fase que un error de ARCA aparece como algo que no es
—primero la numeración provisional (ADR-0068), después la fecha de la venta
(ADR-0064), ahora esto— y las tres veces lo que faltó fue que el sistema dijera
en castellano lo que ya sabía.
