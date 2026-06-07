# CLAUDE.md — Convenciones de NexoSoft

Guía para cualquier agente/persona que trabaje en este repo. Es de lectura
obligatoria antes de tocar código.

## 1. Cómo trabajamos

- **Por fases.** No se implementan todos los módulos a la vez. Cada fase:
  implementa → tests → README del módulo → ADR si hubo decisión importante.
- **Se para y se espera OK** del responsable antes de pasar a la fase siguiente.
- **Commits chicos** y descriptivos con **Conventional Commits**
  (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`). El cuerpo puede ir
  en español.
- Las decisiones de arquitectura se documentan como **ADR** en
  [`docs/adr/`](docs/adr/).
- Si una integración externa (ARCA, hardware, LLM) **no se puede probar acá**, va
  detrás de una **interfaz + mock funcional con tests**, y se documenta qué falta
  para producción.

## 2. Idioma (consistencia obligatoria)

- **Dominio de negocio en español**: entidades, comprobantes, campos y
  comentarios (`Factura`, `NotaDeCredito`, `cuentaCorriente`, `vuelto`,
  `alicuotaIva`).
- **Términos técnicos en inglés** OK (`repository`, `service`, `handler`,
  `dto`, `port`, `adapter`).
- Mensajes de usuario y logs de auditoría: en español.

## 3. Dinero (NO NEGOCIABLE)

- **Nunca** se representa dinero con `number`/`float`. Se usa el value object
  `Money` (sobre `decimal.js`) — ver [ADR-0007](docs/adr/0007-manejo-de-dinero-decimal-exacto.md).
- IVA, impuestos internos, descuentos, recargos, redondeo y vuelto se calculan en
  `@nexosoft/domain` y se cubren con tests.
- Persistencia: PostgreSQL `NUMERIC(18,4)`; SQLite en **enteros (centavos)** o
  texto decimal (nunca `REAL`).

## 4. Offline-first (NO NEGOCIABLE)

- El POS opera contra **SQLite local** como fuente de verdad. Vender, cobrar e
  imprimir **no dependen de la red**.
- Estados de comprobante: `BORRADOR` → `PENDIENTE_CAE` → `AUTORIZADA` |
  `RECHAZADA`. El CAE se pide cuando hay conexión.
- Toda operación que sincroniza pasa por la **outbox** de `@nexosoft/sync` con
  `operacionId` para idempotencia.

## 5. Seguridad (NO NEGOCIABLE)

- **Sin secretos en el repo.** Nada de `.env`, claves, certificados ni `.pfx`
  versionados (ver `.gitignore`). Usar `.env.example`.
- Certificados X.509 de ARCA: fuera del repo (`/secrets`, ignorada), cifrados en
  reposo en producción.
- **RBAC estricto**: roles Administrador / Supervisor / Cajero con permisos
  configurables. Validar permisos en el backend, no sólo en la UI.
- **Auditoría** obligatoria de operaciones sensibles: caja, cambios de precio,
  permisos, anulaciones.

## 6. ARCA aislado

- Toda la integración fiscal vive en `@nexosoft/fiscal` detrás de la interfaz
  `ServicioFiscal`. El resto del sistema **no** conoce SOAP/WSFEv1.
- Reintentos **idempotentes**; el `MockServicioFiscal` permite desarrollar y
  testear sin red. Ver [ADR-0008](docs/adr/0008-servicio-fiscal-arca-aislado.md).

## 7. Estilo de código

- TypeScript en modo **strict** (ver `tsconfig.base.json`); sin `any` salvo
  justificación con comentario.
- Validación de entradas con **zod** en los bordes (API, IPC de Tauri, sync).
- Errores de negocio explícitos (no romper con excepciones genéricas en flujos
  esperados); el caso feliz no se mezcla con el manejo de fallas.
- Nombres de archivos en `kebab-case`; clases/Tipos en `PascalCase`; variables y
  funciones en `camelCase`.
- Formato con Prettier; lint con ESLint (`pnpm format`, `pnpm lint`).

## 8. Tests

- **Vitest** en todos los paquetes. Lógica de dominio (dinero, IVA, CAE,
  conflictos de sync) con **cobertura alta**.
- Tests de integración para el backend y **e2e de los flujos críticos de venta**.
- Un módulo no se considera "hecho" sin tests que cubran su camino feliz y los
  errores relevantes.

## 9. Comandos

```bash
pnpm install            # instalar (corepack enable pnpm si falta pnpm)
pnpm dev                # desarrollo (turbo)
pnpm test               # tests
pnpm lint               # eslint
pnpm typecheck          # chequeo de tipos
pnpm format             # prettier --write
```

## 10. Definition of Done (por módulo)

1. Código en `@nexosoft/*` o `apps/*` respetando estas convenciones.
2. Tests verdes (unitarios + integración cuando aplique).
3. README del módulo actualizado.
4. ADR si hubo una decisión arquitectónica.
5. Sin secretos, sin `number` para dinero, sin lógica de negocio duplicada.
