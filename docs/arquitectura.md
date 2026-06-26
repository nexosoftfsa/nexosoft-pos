# Arquitectura de NexoSoft

Documento vivo. Describe la arquitectura, el **modelo de dominio** y el **modelo
de datos** inicial. Las decisiones puntuales están en los [ADRs](adr/).

## 1. Vista de componentes

```
                         ┌───────────────────────────────────────────┐
                         │                Cloud API (NestJS)          │
                         │  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
   ┌──────────────┐ sync │  │ Catálogo │  │  Stock   │  │  Caja /  │  │
   │ POS desktop  │<────>│  │ Precios  │  │          │  │   CC     │  │
   │  (Tauri 2)   │      │  └──────────┘  └──────────┘  └──────────┘  │
   │              │      │  ┌───────────────────────────────────────┐│
   │ React + TS   │      │  │  @nexosoft/fiscal (ServicioFiscal)     ││──> ARCA
   │ SQLite local │      │  └───────────────────────────────────────┘│   (WSAA+WSFEv1)
   └──────┬───────┘      │            PostgreSQL (multi-sucursal)     │
          │              └───────────────────────────────────────────┘
   ESC/POS · balanza · lector
          │
   (USB/serial vía capa nativa Tauri → @nexosoft/hardware)
```

- **`@nexosoft/domain`** es compartido por POS y backend: una sola fuente de
  reglas (dinero, IVA, comprobantes), sin duplicación.
- El **servicio fiscal** está aislado: emisión y CAE pasan por una interfaz
  ([ADR-0008](adr/0008-servicio-fiscal-arca-aislado.md)).

> **Dónde corre el Cloud API.** El mismo binario se despliega como **servidor de
> sucursal en la LAN** del comercio (una PC/mini-PC), no necesariamente en la
> nube ([ADR-0019](adr/0019-topologia-servidor-de-sucursal-lan.md)). Varias cajas
> comparten datos contra ese servidor, y cada caja sigue siendo offline-first. La
> nube (Railway/Supabase) queda **opcional**, para consolidar multi-sucursal. El
> servidor respalda su base en la **nube propia del cliente**
> ([ADR-0020](adr/0020-respaldo-en-nube-propia.md)).

## 2. Principio rector: offline-first

El flujo de venta **no depende de la red**:

```
Venta (local SQLite) ──> Cobro ──> Impresión de ticket
        │
        └─ comprobante en estado PENDIENTE_CAE
                 │  (cuando hay conexión)
                 ▼
        @nexosoft/fiscal → ARCA → CAE → AUTORIZADA | RECHAZADA
```

Estados del comprobante:

| Estado          | Significado                                              |
| --------------- | ------------------------------------------------------- |
| `BORRADOR`      | En edición, todavía no confirmado.                      |
| `PENDIENTE_CAE` | Venta cerrada e impresa; falta autorización de ARCA.    |
| `AUTORIZADA`    | ARCA otorgó CAE (con número y vencimiento).             |
| `RECHAZADA`     | ARCA rechazó; requiere corrección/reintento.            |

## 3. Modelo de dominio (conceptual)

Entidades principales (nombres en español, ver CLAUDE.md):

### Catálogo y precios
- **Articulo**: `codigoInterno`, `codigoBarras`, `descripcion`, `rubro`,
  `proveedorId`, `unidadDeMedida` (`unidad` | `fraccionado` | `peso`),
  `costoBruto`, `impuestosInternos`, `alicuotaIva`.
- **ListaDePrecios** (`mayorista` | `minorista` | …) y **PrecioArticulo**
  (precio por artículo y lista; el final puede derivarse de costo + % utilidad).
- **Combo** / **Promocion**: agrupaciones y reglas de descuento.

### Stock
- **Deposito** / existencia por sucursal.
- **MovimientoDeStock**: `compra` | `venta` | `ajuste`, con cantidad y motivo.
- **Lote**: para fraccionados/vencimientos (`vencimiento`, `cantidad`).
- **AlertaStockMinimo** (derivada de `stockMinimo`).

### Ventas y comprobantes
- **Venta**: cabecera operativa (cajero, terminal, fecha) + ítems + pagos.
- **Comprobante**: `FacturaA` | `FacturaB` | `FacturaC` | `NotaDeCredito` |
  `NotaDeDebito` | `Remito` | `Presupuesto`. Campos: `puntoDeVenta`, `numero`,
  `fecha`, `condicionIva`, `subtotalGravado`, `iva` (discriminado por alícuota),
  `impuestosInternos`, `total`, `cae`, `vencimientoCae`, `estadoCae`.
- **ItemComprobante**: `articuloId`, `cantidad`, `precioUnitario`, `descuento`,
  `alicuotaIva`, `subtotal`.
- **Pago**: `formaDePago` (`efectivo` | `tarjeta` | `billetera` |
  `cuentaCorriente`), `monto`, `recargo`, y a nivel venta el `vuelto`. El cobro
  electrónico (tarjeta/billetera) se realiza vía `PasarelaDePago`
  (`@nexosoft/pagos`, MercadoPago Point/QR — ADR-0010).

### Configuración del comercio (emisor)
- **ConfiguracionFiscal**: `condicionIvaEmisor` (`ResponsableInscripto` |
  `Monotributo` | …), `cuit`, `puntoDeVenta`. Define qué comprobantes se emiten y
  si el IVA se discrimina. El tipo se resuelve con la función pura
  `resolverTipoComprobante(emisor, receptor)` (ADR-0012): RI → A (a RI) / B (a
  Consumidor Final/Monotributo); Monotributo → C.

### Caja y tesorería
- **SesionDeCaja** (turno): `apertura`, `cierre`, `cajero`, `montoInicial`.
- **MovimientoDeCaja**: `ingreso` | `egreso` (pago a proveedor, extracción…).
- **Arqueo**: conteo y `diferencia` (faltante/sobrante).

### Cuentas corrientes
- **Cliente** / **Proveedor**: datos fiscales, `condicionIva`, `cuit`.
- **CuentaCorriente**: `saldo`, `limiteCredito`, y **MovimientoCuentaCorriente**
  (deuda, cobro, pago).

### Seguridad y multi-sucursal
- **Usuario**, **Rol** (`Administrador` | `Supervisor` | `Cajero`), **Permiso**
  (configurable).
- **Sucursal**, **Terminal** (punto de venta físico). **MVP: una sola sucursal**
  (ADR-0005); el modelo ya incluye `sucursal_id` para crecer a multi-sucursal.
- **RegistroAuditoria**: quién, qué, cuándo, sobre qué entidad.

### Sincronización
- **OperacionSync** (outbox): `operacionId`, `tipo`, `payload`, `estado`,
  `origen` (sucursal/terminal), `intentos`.

## 4. Modelo de datos (boceto inicial)

Tablas núcleo (se refinan en Fase 1). Dinero en `NUMERIC(18,4)` (PostgreSQL):

```
articulo(id, codigo_interno, codigo_barras, descripcion, rubro_id,
         proveedor_id, unidad_medida, costo_bruto NUMERIC(18,4),
         impuestos_internos NUMERIC(18,4), alicuota_iva NUMERIC(5,2))
lista_precios(id, nombre, tipo)
precio_articulo(articulo_id, lista_id, precio NUMERIC(18,4), PK(articulo_id,lista_id))
stock(articulo_id, sucursal_id, cantidad NUMERIC(18,3), stock_minimo NUMERIC(18,3))
movimiento_stock(id, articulo_id, sucursal_id, tipo, cantidad, motivo, fecha)
lote(id, articulo_id, vencimiento, cantidad NUMERIC(18,3))

venta(id, sucursal_id, terminal_id, usuario_id, fecha, total NUMERIC(18,4))
comprobante(id, venta_id, tipo, punto_venta, numero, condicion_iva,
            subtotal_gravado NUMERIC(18,4), iva NUMERIC(18,4),
            impuestos_internos NUMERIC(18,4), total NUMERIC(18,4),
            cae, vencimiento_cae, estado_cae)
item_comprobante(id, comprobante_id, articulo_id, cantidad NUMERIC(18,3),
                 precio_unitario NUMERIC(18,4), descuento NUMERIC(18,4),
                 alicuota_iva NUMERIC(5,2), subtotal NUMERIC(18,4))
pago(id, venta_id, forma_pago, monto NUMERIC(18,4), recargo NUMERIC(18,4))

cliente(id, razon_social, cuit, condicion_iva)
proveedor(id, razon_social, cuit, condicion_iva)
cuenta_corriente(id, titular_tipo, titular_id, saldo NUMERIC(18,4),
                 limite_credito NUMERIC(18,4))
mov_cuenta_corriente(id, cuenta_id, tipo, monto NUMERIC(18,4), comprobante_id, fecha)

sesion_caja(id, sucursal_id, usuario_id, apertura, cierre,
            monto_inicial NUMERIC(18,4))
movimiento_caja(id, sesion_id, tipo, monto NUMERIC(18,4), concepto, fecha)

usuario(id, nombre, email, rol_id, activo)
rol(id, nombre)
permiso(id, rol_id, recurso, accion)
sucursal(id, nombre, punto_venta)
terminal(id, sucursal_id, nombre)
registro_auditoria(id, usuario_id, accion, entidad, entidad_id, datos, fecha)

operacion_sync(operacion_id, tipo, payload, estado, origen, intentos, creado_en)
```

> En **SQLite (POS)** el dinero se guarda en **enteros (centavos)** o texto
> decimal; nunca `REAL`. La conversión y el cálculo viven en `@nexosoft/domain`.

## 5. Seguridad

- **RBAC** validado en el backend (no sólo UI). Permisos configurables por rol.
- **Auditoría** de operaciones sensibles (caja, precios, permisos, anulaciones).
- **Secretos/certificados** fuera del repo; cifrados en reposo en producción.

## 6. Decisiones relacionadas

Ver índice de [ADRs](adr/): monorepo, Tauri, SQLite, sincronización, NestJS,
dinero, ARCA, hardware, **topología de despliegue (ADR-0019)** y **respaldo en
nube propia (ADR-0020)**.
