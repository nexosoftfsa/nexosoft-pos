# @nexosoft/domain

Lógica y tipos de **dominio de negocio** compartidos entre el cliente POS y el
backend. Acá vive la verdad de las reglas: dinero, IVA, comprobantes, cálculo de
totales, descuentos, vuelto y redondeo. **No se duplica esta lógica** en ningún
otro paquete.

- Sin dependencias de framework (ni React ni NestJS): TypeScript puro.
- Dinero con **decimales exactos** (`decimal.js`), nunca `number` (ver ADR-0007).
- Validación con `zod` para reutilizar esquemas en cliente y servidor.

Es un _internal package_: se consume como código fuente TS (`workspace:*`) y lo
transpila quien lo importa.

## Contenido (Fase 1.1 — núcleo de dominio)

| Módulo                          | Qué expone                                                                                                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dinero/money.ts`               | `Money`: value object inmutable de dinero exacto. Suma, resta, multiplicación por cantidad, porcentaje, división, redondeo `HALF_UP`, comparaciones y serialización (decimal string / centavos / JSON). |
| `fiscal/condicion-iva.ts`       | `CondicionIva` (RI, Monotributo, Consumidor Final, Exento, No Categorizado) y etiquetas.                                                                                                                |
| `fiscal/alicuota-iva.ts`        | `AlicuotaIva` y las alícuotas argentinas (0 · 2,5 · 5 · 10,5 · 21 · 27 %) con su código ARCA (WSFEv1).                                                                                                  |
| `fiscal/tipo-comprobante.ts`    | `TipoComprobante` (incluye `TicketNoFiscal`, Fase 10.1: venta real sin CAE para un comercio sin alta en ARCA — ADR-0041), `EstadoCae`, `letraDe`, `discriminaIva`, `requiereCae` y la función pura `resolverTipoComprobante(emisor, receptor)` (ADR-0012).                                                     |
| `ventas/calculo-comprobante.ts` | `calcularComprobante(líneas, opciones)`: subtotal, descuentos, IVA discriminado por alícuota y total, con redondeo conciliado (ADR-0013).                                                               |
| `ventas/pago.ts`                | `FormaDePago`, `Pago` y `calcularCobro`: **pago combinado**, vuelto (solo efectivo) y saldo pendiente.                                                                                                  |
| `esquemas/esquemas.ts`          | Esquemas `zod` para validar la forma cruda de los datos en los bordes (IPC / API).                                                                                                                      |

## Contenido (Fase 1.2 — catálogo y precios)

| Módulo                         | Qué expone                                                                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `catalogo/unidad-de-medida.ts` | `UnidadDeMedida` (unidad / fraccionado / peso) y `permiteCantidadFraccionada`.                                                                |
| `catalogo/articulo.ts`         | `Articulo` (costo **neto**) + `crearArticulo` / `desactivarArticulo` con validaciones.                                                        |
| `catalogo/lista-de-precios.ts` | `ListaDePrecios` (minorista/mayorista/personalizada), `PrecioArticulo` (manual o por margen).                                                 |
| `catalogo/precios.ts`          | `calcularPrecioVenta`, `calcularMargen`, `resolverPrecioArticulo` y `redondearAMultiploDe`. Costeo **por régimen** RI/Monotributo (ADR-0014). |
| `catalogo/promocion.ts`        | `Combo` (+ `ahorroCombo`) y `Promocion` (`%`, monto fijo, lleva/paga NxM) con evaluadores puros y vigencia.                                   |

## Contenido (Fase 1.3 — stock)

| Módulo                      | Qué expone                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `comun/cantidad.ts`         | `Cantidad`: value object de cantidades exactas (como `Money`, sin moneda).                                                |
| `stock/deposito.ts`         | `Deposito` (ubicación de stock) + `crearDeposito`.                                                                        |
| `stock/existencia.ts`       | `Existencia` (snapshot), `bajoStockMinimo`, `hayStockSuficiente`.                                                         |
| `stock/movimiento-stock.ts` | `MovimientoDeStock` (compra/venta/ajuste/merma/devolución), `aplicarMovimiento` (bloquea negativo), `calcularExistencia`. |
| `stock/lote.ts`             | `Lote`, vencimientos (`estaVencido`, `porVencer`), `ordenarFEFO`, `descontarFEFO`.                                        |
| `stock/alerta-stock.ts`     | `evaluarAlertasStockMinimo` y `evaluarAlertasVencimiento`.                                                                |

## Reglas clave

- **Dinero exacto**: todo importe es `Money`. Nunca `number`/`float`.
- **IVA según la letra**: A discrimina; B lo lleva incluido (se calcula pero no se
  muestra); C (Monotributo) no tiene IVA. Ver `calcularComprobante` y ADR-0013.
- **Invariante**: `netoGravado + iva = total` siempre se cumple.
- **Vuelto**: solo se entrega en efectivo; nunca más del efectivo recibido.
- **Costeo por régimen**: el precio se deriva del costo neto + margen según RI o
  Monotributo (el IVA de compra es crédito o costo, respectivamente). Ver ADR-0014.
- **Cantidades exactas**: el stock se mide con `Cantidad` (decimal), nunca `number`.
  El stock negativo se bloquea por defecto (configurable). Ver ADR-0015.

## Comandos

```bash
pnpm --filter @nexosoft/domain test       # vitest
pnpm --filter @nexosoft/domain typecheck   # tsc --noEmit
pnpm --filter @nexosoft/domain lint        # eslint
```

> Estado: **Fases 1.1, 1.2 y 1.3 implementadas** (143 tests). Próximo: venta/POS
> offline (1.4) — donde aparece SQLite y la persistencia real.
