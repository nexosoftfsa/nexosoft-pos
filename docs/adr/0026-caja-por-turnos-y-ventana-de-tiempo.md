# ADR-0026: Caja por turnos, ventas en efectivo por ventana de tiempo

- **Estado:** Aceptada
- **Fecha:** 2026-07-02
- **Decisores:** Equipo NexoSoft (decisión del usuario)
- **Relacionada:** ADR-0007 (dinero decimal), ADR-0019 (servidor de sucursal en
  LAN), ADR-0025 (shell/ABM online)

## Contexto

La Fase 7.4 agrega **Caja y Tesorería** al POS: apertura/cierre de turno, arqueo,
ingresos/egresos de efectivo y resumen del turno. No había modelo de caja en el
schema. Hay que decidir cómo se estructura el turno y, sobre todo, **cómo entran
las ventas en efectivo al saldo de caja** sin romper el flujo de ventas, que es
offline-first y sincroniza después.

## Decisión

1. **Caja por turnos, uno abierto por terminal.** Un `TurnoCaja` se abre en una
   terminal con un `fondoApertura`, acumula `MovimientoCaja` (INGRESO/EGRESO de
   efectivo) y se cierra con un arqueo (`montoContado`), que calcula la
   `diferencia`. Solo puede haber un turno `ABIERTO` por terminal a la vez (lo
   valida el service; abrir con otro abierto → 409).
2. **Las ventas en efectivo NO se duplican en la caja.** El saldo teórico se
   **deriva** de las `Venta` con `medioPago = EFECTIVO` de la terminal, dentro de
   la ventana de tiempo del turno (`abiertoEn … cerradoEn/ahora`):

   ```
   saldoTeorico = fondoApertura + Σ ventasEfectivo(ventana) + Σ ingresos − Σ egresos
   diferencia   = montoContado − saldoTeorico    (+ sobrante / − faltante)
   ```
3. **Cualquier usuario logueado abre, mueve y cierra su caja** (decisión del
   usuario). No se gatea el cierre por rol; es el turno del propio cajero.
4. **Dinero con `Decimal(12,2)`** y agregación en el backend (consistente con
   Stock/Reportes), devolviendo los importes como string con 2 decimales.

## Consecuencias

### Positivas

- La caja **no se acopla** al flujo de ventas: vender no requiere que haya una
  caja abierta en el servidor, así que la sync offline-first sigue intacta.
- Sin doble registro de la venta (una sola fuente de verdad: la tabla `Venta`).
- El arqueo es explícito y auditable (fondo, ventas, movimientos, contado,
  diferencia).

### Negativas / costos

- El vínculo venta↔turno es **por tiempo + terminal**, no explícito. Una venta
  con `creadaEn` en el borde exacto del cierre podría caer de un lado u otro; en
  la práctica es despreciable para una caja de comercio.
- Si una venta en efectivo se sincroniza **tarde** (offline) con `creadaEn`
  dentro de un turno ya cerrado, no se refleja en ese arqueo. Aceptado para el
  MVP; si molesta, se puede evolucionar a vínculo explícito.

## Alternativas consideradas

- **`turnoCajaId` explícito en `Venta`**, asociado al abrir la venta —
  descartado: acopla la venta a que haya caja abierta y complica la sync
  offline-first (el POS tendría que conocer/propagar el turno).
- **Registrar un `MovimientoCaja` por cada venta en efectivo** — descartado:
  duplica la información de la venta en la caja y hay que mantener ambas en sync.
- **Caja por usuario en vez de por terminal** — descartado: el efectivo físico
  vive en el cajón de la terminal, no en la persona; el turno por terminal modela
  mejor la realidad del comercio.
