# ADR-0042: Importador de catálogo desde el sistema anterior del comercio

- **Estado:** Aceptada
- **Fecha:** 2026-08-01
- **Decisores:** Equipo NexoSoft
- **Relacionada:** ADR-0041 (modo sin ARCA), procedimiento de instalación
  (memoria de proyecto)

## Contexto

El cliente real de la Fase 10 tiene **711 artículos** cargados en su sistema
actual y exportó un Excel (`Migrar Articulos.xlsx`: código de barras,
descripción, rubro, costo, %IVA, precio de venta, stock, control de stock,
activo). Migrarlos a mano no es viable. El usuario decidió (vía
`AskUserQuestion`) que el resultado quede como **semilla local reusable**
(datos versionados en el repo, sin catálogo maestro central en la nube —
mantiene ADR-0019/0020 intactos).

## Decisión

1. **Separación lógica pura / I/O**, como en toda integración del proyecto:
   `apps/cloud-api/src/catalogo/importar-articulos.ts` mapea una fila
   normalizada (`FilaCatalogo`) al DTO de `/productos`, **sin tocar red**. El
   script `scripts/importar-catalogo.mjs` hace el I/O (leer el Excel con
   `exceljs` —ya era dependencia—, autenticar, y llamar a la API). Permite
   testear las reglas de negocio con vitest sin un servidor real.
2. **Columnas leídas por NOMBRE de encabezado**, no por posición — el mapa
   `COLUMNAS` del script es lo único que hay que tocar si otro cliente exporta
   con nombres de columna distintos; la lógica de mapeo no cambia.
3. **Reglas de mapeo** (con evidencia real de las 711 filas):
   - `% IVA` → `TipoIva` (0→EXENTO, 10/10,5→IVA_10_5, 21→IVA_21, 27→IVA_27);
     un valor no reconocido **lanza** (fila queda afuera con motivo listado,
     no se asume una alícuota "por las dudas").
   - `Rubro` vacío → categoría `"Sin Clasificar"` (17 filas del archivo real ya
     traían ese rubro tal cual del sistema anterior).
   - `Stock` negativo o cero → **no se siembra movimiento** (se advierte, pero
     no se replica un número negativo: es un artefacto del sistema anterior,
     no algo operativamente válido acá). `Stock` positivo se siembra con un
     único `POST /stock/movimientos` tipo `ENTRADA` (preserva fraccionarios,
     ej. "1.5" para un queso vendido por peso).
   - `Precio Venta`/`Precio Costo` en $0 → se importan igual (Money.cero() es
     válido) pero quedan **advertidos** para revisión manual antes de vender.
   - `Activo = "N"` → se crea igual (la API no admite crear inactivo
     directamente) y se **desactiva** con `DELETE /productos/:id` a
     continuación.
   - `Proveedor` (100% vacío en el archivo real) y `Stock mínimo`/`Stock
     máximo` (casi siempre 0, sin campo equivalente hoy en `Producto`) **no se
     importan** — no hay dónde persistirlos sin inventar alcance nuevo.
4. **Idempotente por `codigo`**: un producto que ya existe (409 del backend)
   se cuenta como "ya existía" y se omite (no se pisa, no se duplica el
   stock) — permite volver a correr el script después de corregir errores.
5. **Categorías reusadas por nombre exacto**: antes de crear, se listan las
   existentes (`GET /categorias`) y solo se crean las que faltan — evita
   categorías duplicadas en corridas sucesivas.
6. **`--dry-run`**: imprime el resumen (categorías, artículos, advertencias)
   sin escribir nada. Recomendado siempre antes de importar contra un
   servidor real.

## Consecuencias

- Verificado de punta a punta contra un backend real (Postgres embebido +
  cloud-api real, patrón de `seed-demo.mjs`): **711/711 productos creados, 0
  errores**, 18 categorías nuevas + 4 reusadas, 555 con stock inicial, acentos
  (Ñ, á/é/í/ó/ú) preservados correctamente end-to-end. Reintentar el mismo
  archivo da **0 creados / 711 "ya existían"** (idempotencia confirmada).
- El mismo script sirve para el catálogo REAL del cliente cuando se
  aprovisione su servidor, y como plantilla para acelerar el alta de un
  comercio de rubro similar (almacén/kiosco) en el futuro — sin requerir un
  catálogo maestro compartido.
- Deuda documentada, no oculta: 38 advertencias de datos (34 stocks negativos,
  4 precios en $0) quedan listadas para que el cliente las revise antes de
  vender; no bloquean la importación.

## Alternativas consideradas

- **UI de carga de Excel en el POS/panel** (self-service para el cliente) —
  descartada por ahora: el usuario decidió que la migración la hace el equipo
  de NexoSoft (no el cliente), y una UI de upload es alcance nuevo no pedido
  todavía. El script cubre el caso real con menos superficie.
- **Catálogo maestro central en la nube** (compartido entre todos los
  clientes) — descartada: revive la arquitectura multi-tenant del pivot SaaS
  que quedó en pausa; la "semilla reusable" como archivo versionado en el
  repo alcanza para el objetivo real (acelerar altas futuras) sin ese costo.
- **Persistir `Stock mínimo/máximo` inventando campos nuevos en `Producto`**
  — descartado: no hay caso de uso pidiéndolo todavía (el POS ya tiene un
  umbral configurable client-side en Stock, Fase 7.3); se puede sumar después
  si hace falta.
