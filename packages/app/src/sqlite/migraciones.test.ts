import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

import type { EjecutorSql, Fila, ValorSql } from "./ejecutor-sql.js";
import { crearEsquema } from "./esquema.js";
import { migrarAlicuotaIvaNullable } from "./migraciones.js";

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir("node:sqlite") as typeof import("node:sqlite");
type DBSync = InstanceType<typeof DatabaseSync>;

class EjecutorNodeSqlite implements EjecutorSql {
  constructor(private readonly db: DBSync) {}
  async ejecutar(sql: string, params: readonly ValorSql[] = []): Promise<void> {
    if (params.length === 0) this.db.exec(sql);
    else this.db.prepare(sql).run(...params);
  }
  async consultar<T extends Fila = Fila>(
    sql: string,
    params: readonly ValorSql[] = [],
  ): Promise<T[]> {
    return this.db.prepare(sql).all(...params) as unknown as T[];
  }
}

/**
 * El esquema TAL COMO quedó en la PC de pruebas: `alicuota_iva NOT NULL` en las
 * dos tablas, con los hijos de `articulo` que hacen que el `DROP TABLE` no sea
 * trivial. Se escribe a mano a propósito — es una base vieja, no la que genera
 * `crearEsquema` hoy.
 */
const ESQUEMA_VIEJO = `
  CREATE TABLE articulo (
    id TEXT PRIMARY KEY,
    codigo_interno TEXT NOT NULL UNIQUE,
    codigo_barras TEXT,
    descripcion TEXT NOT NULL,
    rubro_id TEXT,
    proveedor_id TEXT,
    unidad_de_medida TEXT NOT NULL CHECK (unidad_de_medida IN ('unidad','fraccionado','peso')),
    costo_neto_cent INTEGER NOT NULL CHECK (costo_neto_cent >= 0),
    alicuota_iva TEXT NOT NULL,
    activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
    mostrar_en_grilla_rapida INTEGER NOT NULL DEFAULT 0 CHECK (mostrar_en_grilla_rapida IN (0,1))
  );
  CREATE INDEX idx_articulo_barras ON articulo (codigo_barras);
  CREATE TABLE deposito (id TEXT PRIMARY KEY, nombre TEXT NOT NULL, sucursal_id TEXT);
  CREATE TABLE existencia (
    articulo_id TEXT NOT NULL REFERENCES articulo(id),
    deposito_id TEXT NOT NULL REFERENCES deposito(id),
    cantidad TEXT NOT NULL DEFAULT '0',
    stock_minimo TEXT NOT NULL DEFAULT '0',
    PRIMARY KEY (articulo_id, deposito_id)
  );
  CREATE TABLE venta (
    id TEXT PRIMARY KEY,
    fecha TEXT NOT NULL,
    punto_de_venta INTEGER NOT NULL,
    numero INTEGER NOT NULL,
    tipo_comprobante TEXT NOT NULL,
    estado_cae TEXT NOT NULL,
    cliente_id TEXT,
    neto_gravado_cent INTEGER NOT NULL,
    iva_cent INTEGER NOT NULL,
    total_cent INTEGER NOT NULL,
    vuelto_cent INTEGER NOT NULL DEFAULT 0,
    cae TEXT,
    vencimiento_cae TEXT
  );
  CREATE TABLE item_venta (
    id TEXT PRIMARY KEY,
    venta_id TEXT NOT NULL REFERENCES venta(id),
    articulo_id TEXT NOT NULL,
    descripcion TEXT NOT NULL,
    cantidad TEXT NOT NULL,
    precio_unitario_cent INTEGER NOT NULL,
    alicuota_iva TEXT NOT NULL,
    descuento_porcentaje TEXT,
    importe_cent INTEGER NOT NULL,
    costo_neto_cent INTEGER
  );
  INSERT INTO articulo VALUES ('art1','A1',NULL,'Arroz',NULL,NULL,'unidad',110000,'0',1,0);
  INSERT INTO articulo VALUES ('art2','A2',NULL,'Agua',NULL,NULL,'unidad',70000,'21',1,1);
  INSERT INTO deposito VALUES ('dep','Central',NULL);
  INSERT INTO existencia VALUES ('art1','dep','5','0');
  INSERT INTO venta VALUES ('v1','2026-09-26',2,1,'FacturaA','AUTORIZADA',NULL,0,0,145000,0,NULL,NULL);
  INSERT INTO item_venta VALUES ('i1','v1','art1','Arroz','1',145000,'0',NULL,145000,110000);
`;

function baseVieja(): { db: DBSync; ejecutor: EjecutorSql } {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(ESQUEMA_VIEJO);
  return { db, ejecutor: new EjecutorNodeSqlite(db) };
}

async function admiteNull(ejecutor: EjecutorSql, tabla: string): Promise<boolean> {
  const filas = await ejecutor.consultar<{ name: string; notnull: number }>(
    `PRAGMA table_info(${tabla})`,
  );
  return filas.find((f) => f.name === "alicuota_iva")?.notnull === 0;
}

describe("migrarAlicuotaIvaNullable", () => {
  /**
   * El caso de campo: el catálogo del servidor traía un artículo exento, el
   * volcado escribía NULL, la base lo rechazaba con "NOT NULL constraint
   * failed: articulo.alicuota_iva" y la transacción entera hacía ROLLBACK. No
   * se caía el exento: no entraba NADA. Tres rondas de pruebas con el catálogo
   * congelado (ADR-0084).
   */
  it("deja guardar un exento donde antes reventaba", async () => {
    const { db, ejecutor } = baseVieja();
    expect(() =>
      db.exec("INSERT INTO articulo VALUES ('art3','A3',NULL,'Sal',NULL,NULL,'unidad',1,NULL,1,0)"),
    ).toThrow(/NOT NULL/);

    await migrarAlicuotaIvaNullable(ejecutor);

    db.exec("INSERT INTO articulo VALUES ('art3','A3',NULL,'Sal',NULL,NULL,'unidad',1,NULL,1,0)");
    const fila = await ejecutor.consultar("SELECT alicuota_iva FROM articulo WHERE id = 'art3'");
    expect(fila[0]?.alicuota_iva).toBeNull();
  });

  it("migra las dos tablas", async () => {
    const { ejecutor } = baseVieja();
    expect(await admiteNull(ejecutor, "articulo")).toBe(false);
    expect(await admiteNull(ejecutor, "item_venta")).toBe(false);

    await migrarAlicuotaIvaNullable(ejecutor);

    expect(await admiteNull(ejecutor, "articulo")).toBe(true);
    expect(await admiteNull(ejecutor, "item_venta")).toBe(true);
  });

  /** Recrear una tabla que es PADRE de otras no puede perder ni una fila. */
  it("conserva las filas, los hijos y los índices", async () => {
    const { db, ejecutor } = baseVieja();
    await migrarAlicuotaIvaNullable(ejecutor);

    const articulos = await ejecutor.consultar("SELECT * FROM articulo ORDER BY id");
    expect(articulos.map((a) => [a.id, a.descripcion, a.alicuota_iva])).toEqual([
      ["art1", "Arroz", "0"],
      ["art2", "Agua", "21"],
    ]);
    // La marca local de grilla rápida es la que más fácil se pierde en una
    // copia hecha con las columnas en otro orden.
    expect(articulos[1]?.mostrar_en_grilla_rapida).toBe(1);

    expect(await ejecutor.consultar("SELECT * FROM existencia")).toHaveLength(1);
    expect(await ejecutor.consultar("SELECT * FROM item_venta")).toHaveLength(1);
    expect(await ejecutor.consultar("PRAGMA foreign_key_check")).toHaveLength(0);

    const indices = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'articulo'")
      .all() as Array<{ name: string }>;
    expect(indices.map((i) => i.name)).toContain("idx_articulo_barras");
  });

  /** Las claves foráneas tienen que quedar como estaban: encendidas. */
  it("deja las claves foráneas activadas al terminar", async () => {
    const { db, ejecutor } = baseVieja();
    await migrarAlicuotaIvaNullable(ejecutor);
    const [fk] = db.prepare("PRAGMA foreign_keys").all() as Array<{ foreign_keys: number }>;
    expect(fk?.foreign_keys).toBe(1);
    expect(() => db.exec("INSERT INTO existencia VALUES ('fantasma','dep','1','0')")).toThrow();
  });

  /** En una base sana no toca nada, y se puede correr en cada arranque. */
  it("no hace nada sobre una base ya migrada", async () => {
    const { ejecutor } = baseVieja();
    await migrarAlicuotaIvaNullable(ejecutor);
    await migrarAlicuotaIvaNullable(ejecutor);
    expect(await admiteNull(ejecutor, "articulo")).toBe(true);
    expect(await ejecutor.consultar("SELECT * FROM articulo")).toHaveLength(2);
  });

  it("no toca una base creada de cero con el esquema de hoy", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    const ejecutor = new EjecutorNodeSqlite(db);
    await crearEsquema(ejecutor);
    expect(await admiteNull(ejecutor, "articulo")).toBe(true);
    expect(await admiteNull(ejecutor, "item_venta")).toBe(true);
  });
});
