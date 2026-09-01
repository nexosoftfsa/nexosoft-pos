# ADR-0062 — Las llamadas a ARCA piden ECDHE, y no usan `fetch`

- **Estado:** aceptado
- **Fecha:** 2026-09-01

## Contexto

La facturación funcionó meses contra homologación y se rompió el día que un
comercio pasó a producción. El error era:

```
No se pudo contactar a ARCA (fetch failed)
```

Nada más. Con el certificado, la delegación del servicio y el punto de venta
todos verificados y correctos.

Al mostrar la causa que `fetch` esconde en `error.cause`, apareció esto:

```
ERR_SSL_DH_KEY_TOO_SMALL
error:0A00018A:SSL routines:tls_process_ske_dhe:dh key too small
```

`servicios1.afip.gov.ar` negocia Diffie-Hellman con una clave de **1024 bits**.
El OpenSSL de Node la rechaza por política de seguridad y la conexión no llega
a abrirse.

Dos cosas lo hacían difícil de ver:

- **En el navegador abre perfecto.** Chrome ya no ofrece la familia DHE, así
  que negocia ECDHE y esquiva el problema sin enterarse. Eso mandaba a buscar
  el problema a la red, al firewall o al DNS.
- **Homologación no falla.** `wswhomo` acepta ECDHE de entrada, así que todo el
  desarrollo y todas las pruebas pasaron sin tocar el tema.

## Decisión

### Se pide sólo ECDHE

Se midió contra el servidor real de producción:

| Alternativa | Resultado |
|---|---|
| Sin tocar nada | falla |
| `@SECLEVEL=1` | anda, pero negocia la clave DH de 1024 bits |
| `DEFAULT:!DHE` | anda, pero cae en `TLS_RSA`: **sin forward secrecy** |
| **`ECDHE`** | anda con `ECDHE-RSA-AES256-GCM-SHA384` |

Se eligió `ECDHE` porque es el único que resuelve el problema **sin bajar la
seguridad**. Bajar el nivel de OpenSSL habría sido más corto de escribir y peor:
dejaría todas las conexiones a ARCA usando una clave que se rechaza por débil.

Verificado contra los cuatro endpoints —WSAA y WSFEv1, producción y
homologación—: los cuatro negocian ECDHE. `FEDummy` contra producción responde
`AppServer/DbServer/AuthServer = OK` en ~240 ms.

### Se deja de usar `fetch` para ARCA

`fetch` no permite elegir el cifrado: no acepta opciones de TLS y el `undici`
que trae Node no es importable. Las llamadas a ARCA pasan a `node:https` con un
agente propio (`fetchArca`), que además **reutiliza la conexión**: las dos
llamadas de una venta comparten el handshake TLS en vez de hacer uno cada una.

`fetchArca` expone sólo lo que estos clientes usan (`ok`, `status`, `text()`),
declarado como `FetchLike`. Los tests siguen inyectando un doble igual que
antes.

El diagnóstico de ARCA usa **el mismo cliente**. Probar con `fetch` a secas
diría que no se llega aunque el sistema sí pueda —o al revés—, que es peor que
no tener diagnóstico.

## Consecuencias

- Un comercio puede pasar a producción sin toparse con esta pared.
- La conexión con ARCA mantiene forward secrecy.
- Las llamadas son más rápidas: se ahorra un handshake TLS por venta.
- Si algún día ARCA dejara de soportar ECDHE, el handshake fallaría con un
  error claro de TLS. Es improbable: dejaría afuera a todos los navegadores.
- El problema tardó tres días en encontrarse porque el mensaje escondía la
  causa. Ver `detalle-de-red.ts`: la cadena de `cause` ahora se muestra
  completa, y el diagnóstico permite probar el circuito sin emitir una venta.
