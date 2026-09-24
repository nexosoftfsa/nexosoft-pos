# ADR-0082 — Un botón que no contesta no se puede diagnosticar

Fecha: 2026-09-23
Estado: aceptado

## Contexto

Tres vueltas de prueba de campo seguidas —la séptima, la octava y la novena—
terminaron con el mismo resultado en el mismo paso: **el producto exento seguía
imprimiéndose como "IVA 0%"**. Tres veces, con tres causas distintas de mi
lado, y ninguna detectable desde afuera.

1. **7ª**: el catálogo sólo se bajaba al arrancar el POS; "Sincronizar" nada más
   subía la cola. Le dije a Sebastián que tocara el botón y ese botón no hacía
   eso.
2. **8ª**: el botón ya bajaba el catálogo, pero **desaparecía cuando no había
   nada en la cola** — o sea justo en el caso normal.
3. **9ª**: el botón estaba, Sebastián lo tocó, y el catálogo siguió viejo.

Lo que las tres tienen en común no es el defecto: es que **desde afuera se
veían idénticas**. Un botón que se aprieta, no dice nada, y deja todo igual.

La causa de fondo son dos `catch` anidados que no registraban nada:

```ts
// intentarPullCatalogo
try { ... } catch { return false; }

// onCatalogoCambiado
} catch {
  // quedarse con la foto vieja no es una regresión
}
```

El comentario del segundo es cierto y es la trampa. Quedarse con la foto vieja
efectivamente no rompe nada — pero deja al comercio operando con un catálogo
viejo **y a nosotros sin forma de saberlo**.

## Decisión

### El manual habla; el automático anota

Son dos caminos con exigencias distintas:

- **El pull del arranque** no puede romper el arranque: un POS que no abre
  porque no hay red es peor que un POS con el catálogo de ayer. Sigue siendo
  tolerante, pero ahora **registra** lo que pasó en vez de tragárselo.
- **El pull del botón** lo pidió una persona. Si falla, esa persona se entera:
  la píldora muestra *"Las ventas se subieron, pero el catálogo no bajó: …"* con
  el motivo, y si sale bien, *"Catálogo al día (N productos)"*.

Que diga cuántos productos no es adorno: es la diferencia entre "no pasó nada"
y "pasó y trajo esto".

### La descarga sale de la transacción

`sincronizarCatalogo` hacía las dos llamadas HTTP **adentro** de la transacción
SQLite. Dos problemas:

- El ejecutor serializa todo en una cola (ADR-0023), así que mientras se
  esperaban las respuestas **la base entera quedaba tomada**: una venta en ese
  momento se frenaba hasta que el servidor contestara.
- Cualquier error de red disparaba un `ROLLBACK` de una transacción que no había
  escrito nada, y el fallo de red se confundía con un fallo de escritura.

Ahora son dos funciones: `descargarCatalogo` (red) y `volcarCatalogo` (disco,
dentro de la transacción). La transacción dura lo que tarda el disco.

## Lo que sigue sin saberse

**Todavía no sé por qué el catálogo no bajó en la novena vuelta.** Revisé la
cadena entera —el endpoint devuelve `tipoIva`, el mapeo manda `EXENTO` a `null`,
el `UPSERT` escribe `NULL`, la lectura distingue `NULL` de `"0"`— y está bien
de punta a punta.

Este ADR no arregla el exento: **arregla no poder ver qué pasa**. La próxima
vez el botón va a decir si trajo 37 productos o si falló y por qué, y con eso
se resuelve en una vuelta en lugar de tres.

Vale decirlo así de claro porque la tentación era publicar el cambio como si
fuera el arreglo.

## Lo que se hizo mal

Un `catch` vacío con un comentario que explica por qué está vacío es, casi
siempre, una decisión tomada mirando sólo el camino feliz. El comentario
contesta "¿qué pasa si falla?" — *nada grave* — y nunca "¿cómo nos enteramos?".

La regla que queda: **un error que se traga se documenta o se registra, pero no
las dos cosas menos**. Si de verdad no importa, no importa escribirlo en el log.
