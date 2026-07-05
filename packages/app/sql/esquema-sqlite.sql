-- Esquema SQLite del POS (fuente de verdad offline, ADR-0004).
-- Convenciones (ADR-0007 / ADR-0015):
--   * Dinero: INTEGER en CENTAVOS (nunca REAL).
--   * Cantidades: TEXT decimal (p. ej. '1.250'); nunca REAL.
--   * Fechas: TEXT ISO-8601.
--   * Enums (condición, tipo, estado): TEXT con CHECK.
-- Este archivo es el contrato que implementa el adaptador SQLite (Fase 1.4b).

PRAGMA foreign_keys = ON;

-- Configuración del comercio (emisor). Una sola fila en el MVP.
CREATE TABLE IF NOT EXISTS comercio_config (
  id                    INTEGER PRIMARY KEY CHECK (id = 1),
  cuit                  TEXT    NOT NULL,
  razon_social          TEXT    NOT NULL,
  condicion_iva_emisor  TEXT    NOT NULL CHECK (condicion_iva_emisor IN ('ResponsableInscripto','Monotributo')),
  punto_de_venta        INTEGER NOT NULL,
  deposito_por_defecto  TEXT    NOT NULL,
  lista_predeterminada  TEXT    NOT NULL,
  precios_incluyen_iva  INTEGER NOT NULL DEFAULT 1 CHECK (precios_incluyen_iva IN (0,1)),
  permitir_stock_negativo INTEGER NOT NULL DEFAULT 0 CHECK (permitir_stock_negativo IN (0,1))
);

-- Catálogo --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS articulo (
  id               TEXT PRIMARY KEY,
  codigo_interno   TEXT NOT NULL UNIQUE,
  codigo_barras    TEXT UNIQUE,
  descripcion      TEXT NOT NULL,
  rubro_id         TEXT,
  proveedor_id     TEXT,
  unidad_de_medida TEXT NOT NULL CHECK (unidad_de_medida IN ('unidad','fraccionado','peso')),
  costo_neto_cent  INTEGER NOT NULL CHECK (costo_neto_cent >= 0),
  alicuota_iva     TEXT NOT NULL,            -- porcentaje como texto ('21','10.5')
  activo           INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1))
);
CREATE INDEX IF NOT EXISTS idx_articulo_barras ON articulo (codigo_barras);

CREATE TABLE IF NOT EXISTS lista_precios (
  id            TEXT PRIMARY KEY,
  nombre        TEXT NOT NULL,
  tipo          TEXT NOT NULL CHECK (tipo IN ('minorista','mayorista','personalizada')),
  predeterminada INTEGER NOT NULL DEFAULT 0 CHECK (predeterminada IN (0,1))
);

CREATE TABLE IF NOT EXISTS precio_articulo (
  articulo_id     TEXT NOT NULL REFERENCES articulo(id),
  lista_id        TEXT NOT NULL REFERENCES lista_precios(id),
  modo            TEXT NOT NULL CHECK (modo IN ('manual','margen')),
  precio_manual_cent INTEGER,               -- si modo = 'manual'
  margen_utilidad TEXT,                     -- si modo = 'margen' (porcentaje)
  PRIMARY KEY (articulo_id, lista_id)
);

-- Stock -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deposito (
  id          TEXT PRIMARY KEY,
  nombre      TEXT NOT NULL,
  sucursal_id TEXT
);

CREATE TABLE IF NOT EXISTS existencia (
  articulo_id  TEXT NOT NULL REFERENCES articulo(id),
  deposito_id  TEXT NOT NULL REFERENCES deposito(id),
  cantidad     TEXT NOT NULL DEFAULT '0',
  stock_minimo TEXT NOT NULL DEFAULT '0',
  PRIMARY KEY (articulo_id, deposito_id)
);

CREATE TABLE IF NOT EXISTS movimiento_stock (
  id          TEXT PRIMARY KEY,
  articulo_id TEXT NOT NULL REFERENCES articulo(id),
  deposito_id TEXT NOT NULL REFERENCES deposito(id),
  tipo        TEXT NOT NULL CHECK (tipo IN ('compra','venta','devolucion','merma','ajuste_positivo','ajuste_negativo')),
  cantidad    TEXT NOT NULL,                -- siempre positiva
  fecha       TEXT NOT NULL,
  motivo      TEXT,
  referencia  TEXT
);
CREATE INDEX IF NOT EXISTS idx_mov_articulo ON movimiento_stock (articulo_id, deposito_id);

CREATE TABLE IF NOT EXISTS lote (
  id          TEXT PRIMARY KEY,
  articulo_id TEXT NOT NULL REFERENCES articulo(id),
  deposito_id TEXT NOT NULL REFERENCES deposito(id),
  numero      TEXT,
  vencimiento TEXT NOT NULL,
  cantidad    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lote_vto ON lote (articulo_id, vencimiento);

-- Combos (Fase 8.1.b): un artículo COMBO agrupa componentes cuyo stock se
-- descuenta al vender el combo. El combo no tiene existencia propia.
CREATE TABLE IF NOT EXISTS combo_componente (
  combo_id     TEXT NOT NULL REFERENCES articulo(id),
  componente_id TEXT NOT NULL REFERENCES articulo(id),
  cantidad     TEXT NOT NULL,
  PRIMARY KEY (combo_id, componente_id)
);

-- Ventas y comprobantes -------------------------------------------------------
CREATE TABLE IF NOT EXISTS venta (
  id               TEXT PRIMARY KEY,
  fecha            TEXT NOT NULL,
  punto_de_venta   INTEGER NOT NULL,
  numero           INTEGER NOT NULL,
  tipo_comprobante TEXT NOT NULL,
  estado_cae       TEXT NOT NULL CHECK (estado_cae IN ('BORRADOR','PENDIENTE_CAE','AUTORIZADA','RECHAZADA')),
  cliente_id       TEXT,
  -- Totales (centavos) calculados por el dominio.
  neto_gravado_cent INTEGER NOT NULL,
  iva_cent          INTEGER NOT NULL,
  total_cent        INTEGER NOT NULL,
  vuelto_cent       INTEGER NOT NULL DEFAULT 0,
  -- CAE (se completa al autorizar en ARCA, Fase 2).
  cae              TEXT,
  vencimiento_cae  TEXT,
  UNIQUE (punto_de_venta, tipo_comprobante, numero)
);

CREATE TABLE IF NOT EXISTS item_venta (
  id                  TEXT PRIMARY KEY,
  venta_id            TEXT NOT NULL REFERENCES venta(id),
  articulo_id         TEXT NOT NULL,
  descripcion         TEXT NOT NULL,
  cantidad            TEXT NOT NULL,
  precio_unitario_cent INTEGER NOT NULL,
  alicuota_iva        TEXT NOT NULL,
  descuento_porcentaje TEXT,
  importe_cent        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_item_venta ON item_venta (venta_id);

CREATE TABLE IF NOT EXISTS pago (
  id          TEXT PRIMARY KEY,
  venta_id    TEXT NOT NULL REFERENCES venta(id),
  forma       TEXT NOT NULL CHECK (forma IN ('efectivo','tarjeta','billetera','transferencia','cuentaCorriente')),
  monto_cent  INTEGER NOT NULL,
  referencia  TEXT
);
CREATE INDEX IF NOT EXISTS idx_pago_venta ON pago (venta_id);
