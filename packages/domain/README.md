# @nexosoft/domain

Lógica y tipos de **dominio de negocio** compartidos entre el cliente POS y el
backend. Acá vive la verdad de las reglas: cálculo de precios, IVA, impuestos
internos, descuentos/recargos, vuelto, redondeo y los comprobantes.

- Sin dependencias de framework (ni React ni NestJS): TypeScript puro.
- Dinero con **decimales exactos** (`decimal.js`), nunca `number` (ver ADR-0007).
- Validación con `zod` para reutilizar esquemas en cliente y servidor.

Es un *internal package*: se consume como código fuente TS (`workspace:*`) y lo
transpila quien lo importa.

> Estado: scaffold. El modelo se implementa en Fase 1.
