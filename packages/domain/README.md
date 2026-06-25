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
| `fiscal/tipo-comprobante.ts`    | `TipoComprobante`, `EstadoCae`, `letraDe`, `discriminaIva`, `requiereCae` y la función pura `resolverTipoComprobante(emisor, receptor)` (ADR-0012).                                                     |
| `ventas/calculo-comprobante.ts` | `calcularComprobante(líneas, opciones)`: subtotal, descuentos, IVA discriminado por alícuota y total, con redondeo conciliado (ADR-0013).                                                               |
| `ventas/pago.ts`                | `FormaDePago`, `Pago` y `calcularCobro`: **pago combinado**, vuelto (solo efectivo) y saldo pendiente.                                                                                                  |
| `esquemas/esquemas.ts`          | Esquemas `zod` para validar la forma cruda de los datos en los bordes (IPC / API).                                                                                                                      |

## Reglas clave

- **Dinero exacto**: todo importe es `Money`. Nunca `number`/`float`.
- **IVA según la letra**: A discrimina; B lo lleva incluido (se calcula pero no se
  muestra); C (Monotributo) no tiene IVA. Ver `calcularComprobante` y ADR-0013.
- **Invariante**: `netoGravado + iva = total` siempre se cumple.
- **Vuelto**: solo se entrega en efectivo; nunca más del efectivo recibido.

## Comandos

```bash
pnpm --filter @nexosoft/domain test       # vitest
pnpm --filter @nexosoft/domain typecheck   # tsc --noEmit
pnpm --filter @nexosoft/domain lint        # eslint
```

> Estado: **Fase 1.1 implementada** (69 tests). Próximo: catálogo y precios (1.2),
> stock (1.3) y venta/POS offline (1.4).
