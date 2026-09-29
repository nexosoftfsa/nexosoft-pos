/**
 * Migraciones de ESTRUCTURA que `CREATE TABLE IF NOT EXISTS` no puede hacer.
 *
 * `esquema.ts` crea lo que falta y `agregarColumnasNuevas` agrega columnas
 * nuevas con `ALTER TABLE`. Lo que ninguna de las dos puede hacer es **cambiar
 * una columna que ya existe**: SQLite no tiene `ALTER COLUMN`, así que la única
 * forma es recrear la tabla, copiar las filas y renombrarla (el procedimiento
 * que la documentación de SQLite llama "el workaround de ALTER TABLE").
 *
 * ## Por qué hizo falta
 *
 * `articulo.alicuota_iva` e `item_venta.alicuota_iva` se crearon `NOT NULL`. El
 * 16/9/2026 el código empezó a escribir **NULL para los exentos** (ADR-0076:
 * exento NO es la alícuota del 0%), y la base lo rechazaba:
 *
 *     (code: 1299) NOT NULL constraint failed: articulo.alicuota_iva
 *
 * El volcado del catálogo corre en UNA transacción, así que el primer artículo
 * exento hacía `ROLLBACK` de todo: no fallaba el exento, **no entraba nada**. En
 * la PC de pruebas el catálogo quedó congelado tres rondas seguidas, y como el
 * botón Sincronizar no decía cómo le había ido, se veía como "no pasa nada".
 *
 * Una instalación nueva ya no tiene el problema —el esquema lo declara
 * nullable—, pero las bases ya instaladas se crearon con la versión vieja y
 * `CREATE TABLE IF NOT EXISTS` no las toca. Esto es para ésas.
 */
import type { EjecutorSql } from "./ejecutor-sql.js";

/** Una columna tal como la describe `PRAGMA table_info`. */
interface ColumnaInfo {
  readonly name: string;
  /** 1 si la columna es `NOT NULL`. */
  readonly notnull: number;
}

/**
 * Cada tabla a recrear: el `CREATE TABLE` nuevo, las columnas a copiar (en
 * orden) y los índices que hay que rehacer (se van con el `DROP TABLE`).
 *
 * Las columnas se listan explícitamente y NO con `SELECT *`: el orden lo fija
 * esta lista, no el de la tabla vieja, que puede diferir según qué `ALTER TABLE
 * ADD COLUMN` corrió en esa instalación.
 */
interface TablaARecrear {
  readonly tabla: string;
  readonly columna: string;
  readonly creacion: string;
  readonly columnas: readonly string[];
  readonly indices: readonly string[];
}

const TABLAS: readonly TablaARecrear[] = [
  {
    tabla: "articulo",
    columna: "alicuota_iva",
    creacion: `CREATE TABLE articulo_migrado (
      id TEXT PRIMARY KEY,
      codigo_interno TEXT NOT NULL UNIQUE,
      codigo_barras TEXT,
      descripcion TEXT NOT NULL,
      rubro_id TEXT,
      proveedor_id TEXT,
      unidad_de_medida TEXT NOT NULL CHECK (unidad_de_medida IN ('unidad','fraccionado','peso')),
      costo_neto_cent INTEGER NOT NULL CHECK (costo_neto_cent >= 0),
      alicuota_iva TEXT,
      activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
      mostrar_en_grilla_rapida INTEGER NOT NULL DEFAULT 0 CHECK (mostrar_en_grilla_rapida IN (0,1))
    )`,
    columnas: [
      "id",
      "codigo_interno",
      "codigo_barras",
      "descripcion",
      "rubro_id",
      "proveedor_id",
      "unidad_de_medida",
      "costo_neto_cent",
      "alicuota_iva",
      "activo",
      "mostrar_en_grilla_rapida",
    ],
    indices: [`CREATE INDEX IF NOT EXISTS idx_articulo_barras ON articulo (codigo_barras)`],
  },
  {
    tabla: "item_venta",
    columna: "alicuota_iva",
    creacion: `CREATE TABLE item_venta_migrado (
      id TEXT PRIMARY KEY,
      venta_id TEXT NOT NULL REFERENCES venta(id),
      articulo_id TEXT NOT NULL,
      descripcion TEXT NOT NULL,
      cantidad TEXT NOT NULL,
      precio_unitario_cent INTEGER NOT NULL,
      alicuota_iva TEXT,
      descuento_porcentaje TEXT,
      importe_cent INTEGER NOT NULL,
      costo_neto_cent INTEGER
    )`,
    columnas: [
      "id",
      "venta_id",
      "articulo_id",
      "descripcion",
      "cantidad",
      "precio_unitario_cent",
      "alicuota_iva",
      "descuento_porcentaje",
      "importe_cent",
      "costo_neto_cent",
    ],
    indices: [`CREATE INDEX IF NOT EXISTS idx_item_venta ON item_venta (venta_id)`],
  },
];

/** ¿Esa columna de esa tabla está declarada `NOT NULL` hoy? */
async function esNotNull(ejecutor: EjecutorSql, tabla: string, columna: string): Promise<boolean> {
  // `PRAGMA table_info` de una tabla inexistente devuelve cero filas, no un
  // error: una base recién creada por `crearEsquema` ya pasó por acá con las
  // tablas puestas, pero no cuesta nada tolerarlo.
  const filas = await ejecutor.consultar<ColumnaInfo & Record<string, never>>(
    `PRAGMA table_info(${tabla})`,
  );
  const col = filas.find((f) => String(f.name) === columna);
  return col !== undefined && Number(col.notnull) === 1;
}

/**
 * Recrea una tabla con la definición nueva, conservando las filas.
 *
 * Corre con las claves foráneas APAGADAS. `articulo` es padre de
 * `precio_articulo`, `existencia`, `movimiento_stock`, `lote` y
 * `combo_componente`: con las FK activas, el `DROP TABLE` se comporta como un
 * `DELETE FROM` y rebota contra todos los hijos. Apagarlas es lo que indica la
 * documentación de SQLite para este procedimiento, y al terminar se corre
 * `PRAGMA foreign_key_check` para no quedarnos con la palabra.
 *
 * El `PRAGMA` tiene que ir FUERA de la transacción: adentro no hace nada.
 */
async function recrear(ejecutor: EjecutorSql, t: TablaARecrear): Promise<void> {
  const cols = t.columnas.join(", ");
  await ejecutor.ejecutar("PRAGMA foreign_keys = OFF");
  try {
    await ejecutor.ejecutar("BEGIN");
    try {
      await ejecutor.ejecutar(t.creacion);
      await ejecutor.ejecutar(
        `INSERT INTO ${t.tabla}_migrado (${cols}) SELECT ${cols} FROM ${t.tabla}`,
      );
      await ejecutor.ejecutar(`DROP TABLE ${t.tabla}`);
      await ejecutor.ejecutar(`ALTER TABLE ${t.tabla}_migrado RENAME TO ${t.tabla}`);
      for (const indice of t.indices) await ejecutor.ejecutar(indice);
      await ejecutor.ejecutar("COMMIT");
    } catch (e) {
      try {
        await ejecutor.ejecutar("ROLLBACK");
      } catch {
        // Si el ROLLBACK falla, lo que importa es el error original.
      }
      throw e;
    }

    // Si algo quedó colgado, mejor enterarse acá —al arrancar, con la base
    // todavía sin tocar por la caja— que en la primera venta.
    const huerfanos = await ejecutor.consultar("PRAGMA foreign_key_check");
    if (huerfanos.length > 0) {
      throw new Error(`La migración de ${t.tabla} dejó ${huerfanos.length} referencia(s) rota(s).`);
    }
  } finally {
    await ejecutor.ejecutar("PRAGMA foreign_keys = ON");
  }
}

/**
 * Deja `alicuota_iva` nullable donde todavía no lo esté.
 *
 * Idempotente y barata: en una base sana son dos `PRAGMA table_info` y nada
 * más. Sólo recrea la tabla que hace falta recrear.
 */
export async function migrarAlicuotaIvaNullable(ejecutor: EjecutorSql): Promise<void> {
  for (const t of TABLAS) {
    if (await esNotNull(ejecutor, t.tabla, t.columna)) {
      await recrear(ejecutor, t);
    }
  }
}
