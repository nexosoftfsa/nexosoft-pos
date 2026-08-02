# ADR-0045: Padrón de artículos multi-comercio (herramienta de negocio)

- **Estado:** Aceptada
- **Fecha:** 2026-08-01
- **Decisores:** Equipo NexoSoft
- **Relacionada:** ADR-0042 (importador de catálogo, Fase 10.2 — este ADR
  reusa esa misma herramienta sin modificarla)

## Contexto

El usuario tiene acceso a datos de **118 comercios reales** que corren un
sistema de POS en FoxPro (aparentemente clientes de "Hugo", no de NexoSoft):
una carpeta por comercio en `F:\Informe Hugo oscar\Informe Hugo oscar`, cada
una con tablas `.dbf`. Pidió aislar los artículos de ahí y sumarlos a una
tabla grande de "artículos precargados para clientes futuros" — la misma idea
de semilla reusable de la Fase 10.2 (ADR-0042), pero a mucha mayor escala y
**sin ligarse a ningún cliente puntual**.

## Decisión

1. **Fuente: `articulo.dbf`, no `fdetalle.dbf`.** De las 118 carpetas, 85
   tienen `articulo.dbf` (maestro de artículos real: código, código de
   barras, descripción, rubro, marca, costo, precio, %IVA — 342 MB en total).
   Las 118 tienen `fdetalle.dbf` (líneas de venta históricas, **10,5 GB en
   total**) — se decidió (con el usuario) NO minarlo por ahora: es mucho más
   pesado y la información de producto ahí es indirecta (hay que deducirla de
   ventas viejas, no de un maestro vigente). Se verificaron los 5 esquemas de
   tabla distintos entre los 85 comercios (versiones distintas del sistema a
   lo largo de los años): todos tienen los campos necesarios.
2. **Deduplicación GLOBAL por código de barras**, no por comercio. De 496.239
   filas válidas (tras descartar 2.539 sin código/descripción/precio) salieron
   **28.908 códigos únicos** — la inmensa mayoría de los productos se repiten
   entre comercios (solo 84 códigos de 28.908 aparecen en un único comercio),
   lo cual valida el enfoque: son productos de almacén/kiosco reales y
   comunes, no basura de un solo local. Por código: descripción y rubro =
   forma más frecuente entre todas las apariciones; precio/costo = los de la
   fila con `FECHA` más reciente; IVA = el más cercano a las alícuotas
   argentinas válidas (0/10,5/21/27). Se guarda `veces_visto` (en cuántos
   comercios distintos apareció) como señal de calidad para curar después.
3. **Normalización de rubro.** El campo `DETARUB` (texto libre, sin tabla de
   códigos fuerte entre comercios) traía 152 variantes: mayúsculas/minúsculas
   mezcladas, truncamientos por ancho fijo de FoxPro (`LIMPIEZ` en vez de
   `LIMPIEZA`), basura de exportaciones viejas al inicio (`1COMESTIBLES`,
   `.LIMPIEZA`) y un mis-decode puntual (`Ð`↔`Ñ`). Se aplicó una limpieza
   liviana (sacar basura inicial/final, fusionar variantes truncadas por
   prefijo con diferencia ≤3 caracteres) que bajó a 121 rubros — no se buscó
   una unificación semántica perfecta (ej. "PERFUMERIA" vs "PERFUMERIA Y
   CUIDADO PERSONAL" quedan separados a propósito, no es un error de tipeo).
4. **Reusa el importador de la Fase 10.2 sin tocarlo**: el script nuevo
   (`apps/cloud-api/scripts/padron/extraer-padron-dbf.py`, Python +
   `dbfread`/`openpyxl`) escribe un `.xlsx` con las MISMAS columnas que ya lee
   `scripts/importar-catalogo.mjs` (columnas leídas por nombre, no por
   posición). Verificado con `--dry-run` contra el archivo real: 28.908 filas
   leídas, 121 categorías, 0 errores de mapeo, 8 advertencias menores (costo
   en $0). No se importó a ningún servidor real todavía — no hay cliente
   nuevo esperando este catálogo hoy, queda listo para cuando lo haya.
5. **Uso decidido por el usuario: pool de productos precargados**, no tabla
   de referencia/enriquecimiento. Al dar de alta un cliente nuevo del rubro
   almacén/kiosco, se puede importar este padrón entero como punto de partida
   (con `Stock=0` — no se inventa inventario de nadie) y el cliente borra lo
   que no vende, en vez de escribir su catálogo desde cero.
6. **Se mantiene SEPARADO del catálogo del cliente de la Fase 10** (el
   `Migrar Articulos.xlsx` de 711 artículos importado en la 10.2) — decisión
   explícita del usuario, no se fusionan en un solo archivo.
7. **Python, no Node/TS.** Es una herramienta puntual fuera del ciclo de vida
   normal del monorepo (no corre en producción, no la ejecuta un cliente) —
   `dbfread` no tiene un equivalente Node tan directo, y el resto del
   pipeline (Excel de salida) ya lo resuelve `openpyxl`. Vive en
   `apps/cloud-api/scripts/padron/` por cercanía temática con el otro
   importador, pero es un script standalone, no parte del build de Nest.

## Consecuencias

- **28.908 artículos reales** listos para acelerar el alta de un cliente
  nuevo de rubro similar, verificados end-to-end contra el importador
  existente sin escribir código de importación nuevo.
- El archivo (`padron-articulos-118-comercios.xlsx`, 1,6 MB) se commiteó al
  repo — decisión del usuario, mismo criterio que el Excel del cliente de hoy
  (repo privado, dato agregado sin exponer qué comercio puntual vendió qué a
  qué precio).
- El script queda reproducible (`extraer-padron-dbf.py --entrada ... --salida
  ...`) por si en el futuro aparecen más carpetas DBF para sumar.
- **Deuda documentada:** 33 comercios sin `articulo.dbf` quedaron afuera (sus
  `fdetalle.dbf` no se procesaron); si hace falta más cobertura, es una
  sub-fase aparte, más pesada.

## Alternativas consideradas

- **Minar también `fdetalle.dbf` para los 33 restantes** — descartado por
  ahora (decisión del usuario): 10,5 GB contra 342 MB, y la calidad del dato
  es peor (hay que inferir el producto vigente de líneas de venta históricas
  en vez de leerlo de un maestro). Queda como trabajo futuro si se necesita
  más cobertura.
- **Tabla de referencia/enriquecimiento en vez de pool precargado** — era mi
  recomendación inicial (autocompletar por código de barras al importar el
  catálogo de un cliente nuevo, sin cargarle productos que no pidió), pero el
  usuario prefirió el pool precargado explícitamente.
- **Fusionar con el catálogo del cliente de hoy en un solo archivo** — el
  usuario prefirió mantenerlos separados por fuente.
