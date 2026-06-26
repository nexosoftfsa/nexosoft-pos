# ADR-0019: Topología de despliegue — servidor de sucursal en LAN

- **Estado:** Aceptada
- **Fecha:** 2026-06-26
- **Decisores:** Rodrigo (producto) + equipo técnico

## Contexto

Al definir el alcance del MVP se confirmó que un comercio puede tener **varias
terminales (cajas) en una misma sucursal** que necesitan compartir datos
(stock, precios, ventas) en (casi) tiempo real, pero **sin obligar al cliente a
pagar infraestructura en la nube** (ver [[0020-respaldo-en-nube-propia]]).

El backend ([ADR-0006](0006-backend-nestjs-postgresql.md)) ya existe como
`@nexosoft/cloud-api` (NestJS + PostgreSQL + Prisma). La pregunta no es *qué*
backend, sino **dónde corre** cuando el cliente no quiere nube paga.

Restricciones del dominio retail:
- Una caja **no puede dejar de vender** porque se cayó la red interna o el
  servidor (continuidad operativa).
- La concurrencia de varias cajas sobre los mismos datos exige una base con
  control transaccional serio (no un archivo compartido por red).

## Decisión

El `cloud-api` se despliega como **servidor de sucursal** que corre en **una PC
o mini-PC de la propia red local (LAN)** del comercio. Las terminales POS le
hablan por **HTTP sobre la LAN**.

Las terminales son **offline-first** (no "thin clients"): cada una conserva su
**SQLite local** ([ADR-0004](0004-sqlite-fuente-de-verdad-offline.md)) y puede
operar aunque el servidor esté caído. Al recuperar conexión, sincronizan contra
el servidor mediante la **cola de operaciones**
([ADR-0005](0005-sincronizacion-offline-first.md)).

El **mismo binario** del `cloud-api` puede desplegarse en la nube (Railway/
Supabase u otra) sin cambios de código: la nube pasa a ser **opcional**, sólo
necesaria para consolidar **multi-sucursal**.

```
   SUCURSAL (LAN del comercio)
   ┌──────────────────────────────────────────────┐
   │  PC Servidor (una caja o mini-PC/NAS)         │
   │   • cloud-api NestJS                          │
   │   • PostgreSQL  (verdad de la sucursal)       │
   │   • Respaldo → nube propia (ADR-0020)         │
   └─────────▲──────────────▲──────────────▲───────┘
             │ HTTP/LAN      │              │
       ┌─────┴────┐    ┌─────┴────┐   ┌─────┴────┐
       │ Caja 1   │    │ Caja 2   │   │ Caja 3   │
       │ POS+SQLite│   │ POS+SQLite│  │ POS+SQLite│  ← venden offline
       └──────────┘    └──────────┘   └──────────┘
```

## Consecuencias

### Positivas

- **Costo cero de nube** para el comercio: el servidor corre en hardware propio.
- **Continuidad operativa**: las cajas venden aunque se caiga el servidor o la
  red; reconcilian después.
- **Reúso total** del trabajo de Fase 4.1/4.2: mismo código, distinto lugar de
  deploy. La ruta a la nube queda abierta para multi-sucursal.
- **Dato soberano**: la base vive en el local del cliente.

### Negativas / costos

- **Instalación en Windows**: hay que empaquetar el servidor (PostgreSQL +
  Node) con fricción mínima para un comercio. Se resolverá con un **instalador**
  que incluya las dependencias (fuera del alcance de Fase 4.3).
- **El servidor es un punto a cuidar**: respaldo (ADR-0020) y, a futuro, un modo
  de alta disponibilidad o promoción de otra caja a servidor.
- La sincronización terminal ↔ servidor (Fase 4.5) hay que construirla y testearla.

## Alternativas consideradas

- **Terminales "thin" contra el servidor** — más simples, pero si el servidor o
  la LAN fallan, **el comercio deja de vender**. Inaceptable en retail.
- **Archivo SQLite compartido por red (carpeta de red/SMB)** — varias cajas
  escribiendo el mismo archivo **corrompe** la base; SQLite no está pensado para
  concurrencia por red. Descartado.
- **Obligar a nube paga (Railway/Supabase) desde el MVP** — suma costo mensual
  al cliente sin necesidad para una sola sucursal. Queda como opción para
  multi-sucursal, no como requisito.
