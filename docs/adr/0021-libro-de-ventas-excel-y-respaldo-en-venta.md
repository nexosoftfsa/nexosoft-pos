# ADR-0021: Libro de ventas en Excel y respaldo por venta

- **Estado:** Aceptada
- **Fecha:** 2026-06-26
- **Decisores:** Rodrigo (producto) + equipo técnico

## Contexto

El dueño quiere **control fino de las ventas**: un registro que se actualice en
cada venta y que pueda abrir y auditar sin entrar al sistema. Además pidió que
"se genere una copia en cada venta". Ambos pedidos se apoyan en la capa de
respaldo a nube propia ya existente ([ADR-0020](0020-respaldo-en-nube-propia.md)).

Hay una tensión de costo: generar un **snapshot completo** de la base tras cada
venta es caro si el comercio hace cientos de ventas por día (dump + compresión +
retención en cada operación).

## Decisión

Dos mecanismos complementarios, disparados al registrar una venta:

1. **Libro de ventas en Excel** (`LibroDeVentas` → `LibroDeVentasExcel`): una
   **fila por venta**, en un `.xlsx` que se va actualizando. Liviano, se hace
   **siempre** en cada venta. El archivo vive en la **carpeta de respaldo**
   (`RESPALDO_RUTA/ventas.xlsx`), así viaja a la nube propia del cliente junto a
   los snapshots. Es el registro de control para el dueño.

2. **Snapshot completo por venta**: **opcional**, detrás del flag
   `RESPALDO_EN_CADA_VENTA` (default `false`). Para comercios de bajo volumen que
   quieran máxima seguridad. El caso normal sigue siendo snapshot por cron / al
   cerrar caja.

Ambos efectos corren **después** de confirmar la venta y **no la tumban** si
fallan (se loguean): una venta ya registrada no se revierte porque el Excel o el
respaldo fallen.

El puerto `LibroDeVentas` permite cambiar el formato (Excel hoy; CSV, Google
Sheets o base analítica mañana) sin tocar el módulo de ventas. La escritura del
Excel se **serializa** con una cola interna, porque el servidor atiende ventas
concurrentes y no puede reescribir el archivo desde dos requests a la vez.

## Consecuencias

### Positivas

- El dueño tiene un Excel siempre actualizado, en su propia nube, sin abrir el
  sistema ni exportar nada a mano.
- El costo se mantiene bajo en el caso común (fila incremental, no dump completo).
- Idempotencia: re-registrar una venta (mismo `operacionId`) actualiza su fila,
  no la duplica — coherente con la sincronización ([ADR-0005](0005-sincronizacion-offline-first.md)).
- Cambiar de Excel a otro destino es un adaptador nuevo, sin tocar ventas.

### Negativas / costos

- Reescribir el `.xlsx` completo en cada venta es O(n) por venta; con decenas de
  miles de filas conviene **particionar por período** (ej. `ventas-2026-06.xlsx`)
  o regenerar por lotes. Documentado como evolución, no resuelto en el MVP.
- El Excel es un **registro derivado**, no la fuente de verdad (la base lo es);
  ante divergencia, manda la base.
- `exceljs` agrega peso al backend; aceptable para el valor que da.

## Alternativas consideradas

- **Snapshot completo en cada venta como única opción** — simple pero caro en
  volumen; queda como flag opcional, no como default.
- **CSV en vez de Excel** — más liviano, pero el dueño pidió Excel (fórmulas,
  formato, familiaridad). El puerto permite agregar CSV después.
- **Reporte bajo demanda (no incremental)** — exportar el historial cuando se
  pide. No cumple "que se vaya actualizando" para control continuo; se mantiene
  igual el endpoint de historial para consultas puntuales.
