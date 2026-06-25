# ADR-0014: Costeo y marcación de precios por régimen del emisor

- **Estado:** Aceptada
- **Fecha:** 2026-06-25
- **Decisores:** Equipo NexoSoft

## Contexto

El precio de venta se deriva del costo más un margen de utilidad. Pero **el costo
real y la forma de marcar dependen del régimen fiscal del emisor** frente al IVA:

- Un **Responsable Inscripto (RI)** recupera el IVA de sus compras (es un
  **crédito fiscal**, no un costo) y cobra IVA en sus ventas.
- Un **Monotributista** **no** recupera el IVA de compra (es un **costo** real) y
  **no** discrimina IVA en sus ventas.

Hardcodear "marco sobre el neto y sumo 21%" daría precios y márgenes equivocados
para un Monotributista, que es uno de los dos regímenes soportados (ADR-0012).

Además, el `arquitectura.md` bocetaba el costo como `costoBruto`; hay que definir
con precisión qué representa.

## Decisión

- El `Articulo` guarda **`costoNeto`** (costo sin IVA) y su `alicuotaIva`. Es la
  base canónica de costeo (refina el `costoBruto` del boceto).
- `calcularPrecioVenta(costoNeto, margen, alícuota, { condicionEmisor })` aplica:
  - **RI:** `precioNeto = costoNeto × (1 + margen)`, `IVA = precioNeto × alícuota`,
    `precioFinal = precioNeto + IVA`.
  - **Monotributo:** `costoConIva = costoNeto × (1 + alícuota)`,
    `precioFinal = costoConIva × (1 + margen)`, sin IVA de venta.
- La función devuelve la **composición** (costo considerado, neto, IVA, final),
  no solo el número final.
- `calcularMargen(...)` es la operación inversa (qué margen implica un precio).
- `resolverPrecioArticulo(...)` resuelve un precio de lista **manual** o por
  **margen**.

> Nota matemática: el `precioFinal` resulta **igual** en ambos regímenes (la
> multiplicación conmuta). Lo que cambia es la composición fiscal y, por lo tanto,
> qué le queda al comercio y qué declara. Por eso la función expone ambas partes.

## Consecuencias

### Positivas

- Precios y márgenes correctos para RI **y** Monotributo con un solo modelo.
- El régimen vive en un único lugar (`condicionIvaEmisor`, ADR-0012); el catálogo
  no lo duplica.
- Base lista para listas mayorista/minorista y para combos/promos.

### Negativas / costos

- Hay que pasar la condición del emisor al calcular precios (acoplamiento
  controlado vía `OpcionesPrecio`).
- Si en el futuro se cargan costos **con** IVA, habrá que convertir a neto en el
  borde (queda documentado que el dominio espera neto).

## Alternativas consideradas

- **Guardar el costo con IVA** — descartado: ambiguo para RI (¿neto o bruto?) y
  obliga a recalcular el crédito.
- **Marcar siempre sobre el neto + IVA fijo** — descartado: incorrecto para
  Monotributo (el IVA de compra es costo que el margen debe cubrir).
