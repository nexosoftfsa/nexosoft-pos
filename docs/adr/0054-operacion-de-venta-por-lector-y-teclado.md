# ADR-0054: Operación de la pantalla de venta 100% por lector de barras y teclado

- **Estado:** Aceptada
- **Fecha:** 2026-08-19
- **Decisores:** Equipo NexoSoft (a partir de una revisión de UX externa)
- **Relacionada:** ADR-0009/0018 (puertos de hardware, lector de barras)

## Contexto

Una revisión de UX (reporte externo) sobre `PantallaPos.tsx` identificó
fricciones reales para un cajero con fila de clientes: modificar cantidad o
eliminar un ítem exige el mouse, el flujo de cobro tiene varios clics, y el
foco del teclado no vuelve solo al buscador después de escanear. Se confirmó
que el comercio opera principalmente con **lector de código de barras +
teclado físico**, no con monitor táctil — eso definió el diseño.

Al investigar el código se encontró un conflicto real: el lector de barras
(HID, se comporta como teclado) hoy funciona porque el buscador de texto
**no** tiene foco permanente — un hook (`useLectorTeclado`) captura las
pulsaciones a nivel de `window` y las descarta si el foco está en un
`<input>`, justamente para no interferir con el tipeo normal. Poner foco
fijo en el buscador (como pide un flujo "100% lector") rompería ese camino.
Además, la lógica de cantidad/eliminar/cobro vivía toda inline en el
componente, sin tests — riesgoso para conectarle atajos en una pantalla que
ya opera con plata real.

## Decisión

Primer incremento (se deja explícitamente para después: menú lateral
colapsable a solo íconos — es la pieza más grande y no la pidió el reporte
como urgente):

1. **El foco vive en el buscador, y se recupera solo.** En vez de intentar
   que el lector funcione con el foco en cualquier lado, se invierte el
   enfoque: el buscador tiene foco al montar la pantalla, y cualquier acción
   de "volver a escanear" (agregar un producto, cambiar cantidad, sacar un
   ítem, cerrar una venta) lo devuelve ahí. Si el cajero clickea el fondo
   vacío (el foco cae a `document.body`, sin `relatedTarget`), también
   vuelve solo. **No** se fuerza el foco después de acciones de cobro
   (agregar un pago, etc.) — ahí el cajero está trabajando activamente en
   otro campo y forzarlo se lo pisaría.
2. **`Enter` en el buscador agrega por código exacto**, reemplazando en la
   práctica el camino del buffer global de `useLectorTeclado` para esta
   pantalla (que sigue activo como red de respaldo si el foco cae en otro
   lado). Si el texto no matchea ningún código exacto, se deja tal cual para
   que el cajero elija de la grilla filtrada por nombre — nunca se agrega
   "lo primero que aparece" ante un match ambiguo.
3. **Atajos nuevos, sobre el último ítem agregado** (los ítems se appendean
   al final del carrito):
   - `Supr` saca el último ítem — solo actúa si el buscador está vacío, para
     no interferir con la edición normal de una búsqueda por nombre.
   - `F8` cambia su cantidad a un valor exacto (pide el número con
     `window.prompt`, sin agregar un componente de UI nuevo para esto).
   - `F12` es "cobro rápido": si ya está todo cobrado, confirma directo; si
     falta, agrega el pago exacto en efectivo y confirma apenas el
     recálculo de la previsualización lo permite. **Rechaza explícitamente**
     medios de pago que no sean efectivo (tarjeta/QR tienen su propio flujo
     de confirmación asincrónico, no aplica "exacto").
4. **`Enter` deliberadamente NO hace todo-en-uno.** El reporte proponía que
   `Enter` solo disparara cobro exacto + confirmar + imprimir. Se descartó:
   un `Enter` de más (autocompletado, doble tecleo) cerraría una venta sin
   que el cajero lo haya decidido. `F12` es una tecla dedicada, mucho menos
   propensa a un toque accidental.
5. **No imprime solo.** `F12` cobra y confirma, pero no dispara la
   impresión — hoy no hay impresora térmica real conectada (mock, ver
   `packages/hardware`); el ticket queda listo en el overlay con el botón
   "Imprimir" a mano. Se puede sumar como paso siguiente cuando haya
   hardware real y valga la pena no desperdiciar papel ante un F12 apretado
   de más.
6. **Lógica de carrito extraída a `pos-helpers.ts`** (`cambiarCantidadCarrito`,
   `fijarCantidadCarrito`, `quitarDelCarrito`, `ultimoItemCarrito`,
   `buscarProductoPorCodigo`), con tests — antes vivía inline en
   `PantallaPos.tsx` sin cobertura.
7. **Leyenda visual de los atajos** (`Supr`/`F8`/`F12`) debajo del buscador,
   siempre visible durante la venta.

## Consecuencias

### Positivas
- El cajero puede completar una venta común (escanear todo, cobrar exacto)
  sin tocar el mouse ni una sola vez.
- El conflicto foco/lector se resuelve sin tocar `useLectorTeclado` (que
  también usan `PantallaLogin.tsx` y `EtiquetasGondola.tsx` con semántica
  distinta) — el cambio queda contenido en `PantallaPos.tsx`.
- La lógica de carrito ahora tiene tests; conectarle más atajos en el
  futuro es más seguro.

### Negativas / costos
- `Supr`/`F8`/`F12` solo se escuchan mientras el foco está en el buscador
  (no son atajos globales de `window`) — si el cajero está tipeando el
  monto del pago, no funcionan ahí. Deliberado: un listener global
  arriesgaba interferir con la edición de otros campos (monto, selects).
- `F8` usa `window.prompt()`, no un modal propio — más tosco visualmente,
  pero cero superficie nueva de UI para el primer incremento. Si se vuelve
  el atajo más usado, vale la pena un modal liviano más adelante.
- El menú lateral colapsable (pieza más grande del reporte original) queda
  fuera de este incremento.

## Alternativas consideradas

- **Atajos globales por `window.addEventListener`** — descartado: rompería
  la edición normal de cualquier otro input de la pantalla (monto, medio de
  pago, cliente) si alguna tecla coincidiera.
- **`Enter` hace cobro + confirmar + imprimir en un solo paso** (la
  propuesta original del reporte) — descartada por el riesgo de una venta
  cerrada por accidente; ver punto 4 arriba.
- **Tocar el guard de `useLectorTeclado`** para que no ignore el buscador de
  productos — descartado: ese guard protege también otras pantallas
  (login, etiquetas) con sus propios inputs; cambiarlo ahí es un cambio de
  alcance mayor al pedido, y el enfoque de "el foco vive en el buscador y
  vuelve solo" resuelve el mismo problema sin tocarlo.
