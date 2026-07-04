# Architecture Decision Records (ADR)

Registramos las **decisiones de arquitectura** y su justificación. Un ADR es
inmutable una vez aceptado: si una decisión cambia, se crea uno nuevo que
**supersede** al anterior (no se reescribe la historia).

## Estados

`Propuesta` → `Aceptada` → (`Reemplazada por ADR-XXXX` | `Obsoleta`)

## Formato

Ver [0000-template.md](0000-template.md). Cada ADR tiene: Contexto, Decisión,
Consecuencias y Alternativas consideradas.

## Índice

| #    | Título                                                                                                 | Estado   |
| ---- | ------------------------------------------------------------------------------------------------------ | -------- |
| 0001 | [Registrar decisiones con ADR](0001-registro-de-decisiones-adr.md)                                     | Aceptada |
| 0002 | [Monorepo con pnpm + Turborepo](0002-monorepo-pnpm-turborepo.md)                                       | Aceptada |
| 0003 | [Cliente POS de escritorio con Tauri 2](0003-cliente-pos-tauri.md)                                     | Aceptada |
| 0004 | [SQLite como fuente de verdad offline](0004-sqlite-fuente-de-verdad-offline.md)                        | Aceptada |
| 0005 | [Estrategia de sincronización offline-first](0005-sincronizacion-offline-first.md)                     | Aceptada |
| 0006 | [Backend NestJS + PostgreSQL + Prisma](0006-backend-nestjs-postgresql.md)                              | Aceptada |
| 0007 | [Manejo de dinero con decimales exactos](0007-manejo-de-dinero-decimal-exacto.md)                      | Aceptada |
| 0008 | [Servicio fiscal ARCA aislado](0008-servicio-fiscal-arca-aislado.md)                                   | Aceptada |
| 0009 | [Abstracción de hardware con puertos y mocks](0009-abstraccion-hardware-mocks.md)                      | Aceptada |
| 0010 | [Pasarela de pago aislada (MercadoPago)](0010-pasarela-de-pago-mercadopago.md)                         | Aceptada |
| 0011 | [Proveedor LLM: Google Gemini](0011-proveedor-llm-gemini.md)                                           | Aceptada |
| 0012 | [Condición fiscal del emisor configurable](0012-condicion-fiscal-emisor-configurable.md)               | Aceptada |
| 0013 | [Precios IVA incluido y cálculo de comprobante](0013-precios-iva-incluido-y-calculo-de-comprobante.md) | Aceptada |
| 0014 | [Costeo y marcación de precios por régimen](0014-costeo-y-marcacion-por-regimen.md)                    | Aceptada |
| 0015 | [Cantidades exactas y control de stock negativo](0015-cantidades-exactas-y-control-de-stock.md)        | Aceptada |
| 0016 | [Capa de aplicación con puertos de repositorio](0016-capa-de-aplicacion-y-puertos-de-repositorio.md)   | Aceptada |
| 0017 | [Adaptador SQLite detrás de un ejecutor, testeable sin Tauri](0017-adaptador-sqlite-via-ejecutor.md)   | Aceptada |
| 0018 | [Abstracción de hardware con puertos y mocks](0018-abstraccion-hardware-puertos-y-mocks.md)            | Aceptada |
| 0019 | [Topología de despliegue: servidor de sucursal en LAN](0019-topologia-servidor-de-sucursal-lan.md)     | Aceptada |
| 0020 | [Respaldo en la nube propia del cliente](0020-respaldo-en-nube-propia.md)                              | Aceptada |
| 0021 | [Libro de ventas en Excel y respaldo por venta](0021-libro-de-ventas-excel-y-respaldo-en-venta.md)     | Aceptada |
| 0022 | [Adaptador `EjecutorSql` sobre Tauri y reescritura de placeholders](0022-adaptador-ejecutorsql-tauri-y-placeholders.md) | Aceptada |
| 0023 | [Transacciones en el POS por serialización del acceso a SQLite](0023-transacciones-sqlite-por-serializacion.md) | Aceptada |
| 0024 | [Panel web de reportes como app independiente (read-only)](0024-panel-web-de-reportes.md) | Aceptada |
| 0025 | [Shell de gestión en el POS (menú lateral + identidad de la maqueta)](0025-shell-de-gestion-en-el-pos.md) | Aceptada |
| 0026 | [Caja por turnos, ventas en efectivo por ventana de tiempo](0026-caja-por-turnos-y-ventana-de-tiempo.md) | Aceptada |
| 0027 | [Clientes y cuenta corriente como ledger](0027-clientes-y-cuenta-corriente-ledger.md) | Aceptada |
| 0028 | [Comprobantes y anulación con Nota de Crédito (online)](0028-comprobantes-y-anulacion-con-nota-de-credito.md) | Aceptada |
| 0029 | [Pago combinado (desglose de pagos por venta)](0029-pago-combinado.md) | Aceptada |
| 0030 | [Recargo global en el comprobante](0030-recargo-global.md) | Aceptada |
