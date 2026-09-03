# ADR-0067 — La píldora de estado habla de dos cosas, no de una

Fecha: 2026-09-02
Estado: aceptado

## Contexto

ADR-0066 arregló un error de fondo: el POS confundía *"hay internet"* con
*"llego a mi servidor"*. Al separarlos, quedó un hueco que antes estaba tapado
por casualidad.

En el POS hay **dos caminos que pueden fallar por separado**:

| Camino | Necesita | Se ve en |
|---|---|---|
| Subir la venta al servidor de la sucursal | la LAN | la cola de sync (`pendientes`, `fallidas`) |
| Conseguir el CAE de ARCA | internet | nada |

Una venta puede estar perfectamente subida y sin CAE. Mientras el POS miraba
`navigator.onLine`, un corte de internet ponía la píldora en "Sin conexión" y
eso *parecía* cubrir el segundo caso — por el motivo equivocado, pero cubría.

Con el arreglo, la píldora pasó a decir **"Sincronizado"** con internet caído: es
literalmente cierto —no hay nada esperando subir— y a la vez engañoso, porque
los comprobantes se apilan sin CAE y el comercio no tiene ninguna señal. Se
enteraría en la inspección.

## Decisión

La píldora informa **los dos caminos**, con un orden de prioridad que sigue
*qué tiene que hacer el cajero*, no la gravedad abstracta:

1. **Ventas con error** — no pudieron registrarse. Alguien tiene que mirarlas.
2. **Comprobantes sin CAE fuera de plazo** — ARCA ya no los autoriza por fecha
   (`ventana-de-fecha.ts`). No se arreglan esperando: hay que regularizarlos con
   el contador. Van en rojo, como el caso anterior.
3. **Sin conexión** — no se llega al servidor. Se puede seguir vendiendo.
4. **Sincronizando** — transitorio.
5. **Ventas sin subir** — están acá y todavía no llegaron.
6. **Comprobantes sin CAE** — subidos, esperando a ARCA. **Se resuelve solo**, y
   el texto lo dice: *"no hay que hacer nada"*.
7. **Sincronizado**.

Los estados 5 y 6 van en colores distintos a propósito: son dos problemas
distintos y el cajero no tiene que hacer lo mismo con cada uno.

El conteo lo sirve el servidor (`GET /ventas/esperando-cae`), no la copia local.
Es deliberado: **el CAE lo consigue el servidor por su cuenta**
(`CaePendientesService`), sin que la terminal participe. Contarlo desde la base
local daría un número que sólo sube y nunca baja, porque la terminal nunca se
entera de que ARCA autorizó.

Cuando el servidor no contesta, el hook se queda con el último valor y no
inventa nada: en ese caso la píldora ya está mostrando "Sin conexión", que es la
parte de la historia que importa.

## Consecuencias

- Un corte largo de internet ahora se ve como lo que es: *"N comprobantes sin
  CAE"*, con la aclaración de que se arregla solo.
- Cuando alguno pasa los 5 días que acepta ARCA, la píldora se pone en rojo y
  dice que hay que ir al contador. Ese aviso antes no existía en ningún lado
  visible para el comercio: sólo quedaba en el log del servidor.
- La lógica vive en `estadoDeLaPildora()`, una función pura con tests. El
  componente sólo la pinta.
- Un servidor viejo, sin el endpoint, deja el dato en `null` y la píldora se
  comporta como antes. No hay que actualizar los dos a la vez.
