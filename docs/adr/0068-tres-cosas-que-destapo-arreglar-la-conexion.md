# ADR-0068 — Tres cosas que destapó arreglar la conexión

Fecha: 2026-09-03
Estado: aceptado

## Contexto

Segunda prueba sin internet, con POS 0.1.54. **Lo que se venía a probar salió
bien**: sin internet, con el servidor de la LAN vivo, la venta apareció en
Comprobantes al instante y la caja sumó los $100 sin esperar a nada. El
indicador dijo "Sincronizado", que es lo correcto. Y sin servidor, el respaldo
local funcionó: se vieron las ventas guardadas, con el cartel, y sin los botones
que necesitan servidor.

Pero al abrir ese camino aparecieron tres cosas que antes no podían pasar,
porque antes el POS ni lo intentaba.

## 1. El ticket volvió a imprimir un número que no era el fiscal

El ticket sin internet salió con **"Factura C N° 0002-00000102"**. ARCA después
le puso el **7**.

Es el mismo defecto de ADR-0064, por una puerta nueva. Cuando el servidor está
accesible pero ARCA no, el servidor **igual registra la venta** y le pone un
número propio (`siguienteNumeroNoFiscal`) para poder guardarla. Ese número no es
fiscal y cambia al autorizarse.

El error estaba en el orden de la regla:

```ts
if (datos.numeroConfirmado === true) return false;   // ← cortaba primero
return (datos.esFiscal ?? true) ? datos.cae === undefined : true;
```

`numeroConfirmado` se ponía en `true` con sólo tener respuesta del servidor, y
pisaba la regla del CAE. ADR-0065 lo decía bien en palabras —*"fiscal: lo numera
ARCA, y la prueba es el CAE"*— y estaba implementado al revés.

**Decisión:** para un comprobante fiscal la única prueba es el CAE.
`numeroConfirmado` sólo decide en los internos, que no esperan ninguna
autorización.

Vale la pena notar cuándo se ve: **fiscal + servidor accesible + ARCA caída**.
Ese caso es exactamente el que ADR-0066 acababa de habilitar. Antes no existía.

## 2. La caja decía "Caja cerrada" cuando no había podido preguntar

Sin servidor, la pantalla de Caja mostraba el cartel de **"CAJA CERRADA — no hay
un turno abierto en esta terminal. Abrí uno para empezar"**, con el turno de
Sebastián abierto.

No saber si hay un turno abierto no es lo mismo que saber que no hay. Además de
ser falso, invita a abrir un segundo turno encima de uno que existe.

**Decisión:** si la consulta falla, no se afirma nada. Se dice que no se pudo
consultar, se explica que el turno abierto sigue estando, y se ofrece
reintentar.

## 3. Un corte de red gastaba los reintentos

La venta hecha con el servidor inalcanzable agotó los 5 intentos (uno cada 15 s
≈ 75 segundos) y quedó marcada **"1 con error"**. El cajero tuvo que apretar
"Reintentar" a mano por una caída de red que se había resuelto sola.

El tope de reintentos existe para **dejar de insistir con algo que el servidor
rechaza** — un payload que no puede entrar nunca. Si nunca llegamos a hablar con
el servidor, no hay nada de qué desistir, y cualquier corte más largo que un
minuto y medio termina llenando la pantalla de errores que no son errores.

**Decisión:** un fallo de transporte no consume el presupuesto de reintentos.
El motor lo marca (`transporte: true` — lo pone él, nunca el servidor: si
contestó, llegó) y la operación queda pendiente indefinidamente. Los intentos se
siguen contando para poder verlos en pantalla, pero no marcan la operación como
fallida. Apenas el servidor contesta algo, el tope vuelve a correr normalmente.

## Consecuencias

- Un ticket fiscal no muestra número hasta que ARCA lo autoriza, venga el número
  de donde venga. Es la tercera vez que este defecto aparece por una puerta
  distinta; la regla ahora está en un solo lugar y con el orden correcto.
- La caja no afirma un estado que no pudo verificar.
- Un corte de red largo deja las ventas pendientes, no fallidas. La pantalla de
  errores vuelve a significar lo que decía: cosas que necesitan que alguien
  intervenga.

## Lo que salió bien y conviene anotar

- El CAE tardó entre 5 y 10 minutos en llegar después de volver la conexión.
  Es el ciclo del reintento de pendientes del servidor, y es esperado.
- Con el número corregido, el estado "N comprobantes sin CAE" de ADR-0067 —que
  todavía no estaba publicado cuando se hizo esta prueba— es justo la señal que
  faltaba en el paso 4: el indicador decía "Sincronizado" mientras había un
  comprobante esperando a ARCA.
