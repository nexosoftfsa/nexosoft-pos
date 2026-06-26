# ADR-0020: Respaldo en la nube propia del cliente, con destinos intercambiables

- **Estado:** Aceptada
- **Fecha:** 2026-06-26
- **Decisores:** Rodrigo (producto) + equipo técnico

## Contexto

El cliente quiere ser **dueño de sus datos** y respaldarlos en **su propia nube**
(Google Drive, OneDrive, etc.) o en medios propios (disco externo, NAS), sin
depender de la infraestructura de NexoSoft. El servidor de sucursal
([[0019-topologia-servidor-de-sucursal-lan]]) mantiene la base PostgreSQL con la
verdad de la sucursal y necesita una estrategia de respaldo.

**Restricción técnica crítica:** sincronizar el archivo de base de datos "vivo"
mediante el cliente de escritorio de Google Drive / OneDrive **corrompe la
base**. Drive/OneDrive replican el archivo entero ante cada cambio, sin entender
las transacciones de la base. Si el motor escribe mientras se sube el archivo, o
si dos procesos lo tocan, el resultado es una base inconsistente.

Por lo tanto hay que distinguir dos mecanismos distintos:

| Mecanismo | Para qué | Dónde |
| --- | --- | --- |
| **Respaldo de datos** (snapshot consistente) | Recuperación ante desastre | este ADR |
| **Sincronización transaccional** (cola de operaciones) | Compartir datos entre terminales | [ADR-0005](0005-sincronizacion-offline-first.md) |

## Decisión

Implementar una **capa de respaldo** que genera **snapshots consistentes** de la
base y los entrega a un **destino intercambiable** (patrón puerto/adaptador,
como hardware [ADR-0009] y pagos [ADR-0010]):

- **Puerto `DestinoDeRespaldo`**: `escribir`, `leer`, `listar`, `eliminar`.
- **`DestinoCarpeta`** (MVP): escribe el snapshot en una **ruta configurable**
  del filesystem. Si esa ruta es la carpeta local de **Google Drive/OneDrive
  Desktop**, la nube la sube sola — **sin integrar ninguna API** de Google/
  Microsoft. La misma clase cubre disco externo, NAS o carpeta local.
- **`DestinoEnMemoria`**: mock funcional para tests.
- **`DestinoNubeAPI`** (futuro): integración OAuth con Google Drive / Microsoft
  Graph para subir por API. Queda detrás del mismo puerto; se documenta qué falta
  (registro de app, tokens) sin implementarse en el MVP.

El **snapshot** se genera leyendo todas las tablas dentro de una **transacción**
(lectura consistente), se serializa a JSON y se **comprime con gzip** (zlib
nativo de Node, sin dependencias). Incluye **metadatos** (versión de esquema,
sucursal, fecha, checksum). Se aplica una **política de retención** (mantener los
últimos N respaldos).

La **restauración** existe como operación del motor (testeada) pero **no se
expone como endpoint HTTP abierto** por ser destructiva (sobrescribe la base);
se ejecuta vía herramienta de administración.

## Consecuencias

### Positivas

- **Nube propia sin integración**: apuntar el destino a la carpeta de Drive/
  OneDrive Desktop basta. Cero costo y cero acoplamiento a una API.
- **Snapshot consistente**: evita la corrupción de sincronizar el archivo vivo.
- **Portabilidad**: el formato JSON+gzip no depende de `pg_dump` ni de binarios
  externos; funciona igual en cualquier PC Windows del comercio.
- **Extensible**: agregar `DestinoNubeAPI` (OAuth) o un destino S3 no toca el
  resto del sistema.

### Negativas / costos

- El export JSON es **más pesado y lento** que un `pg_dump` binario para bases
  grandes. Aceptable para el volumen de un comercio mediano; si hiciera falta, se
  agrega un `OrigenPgDump` detrás del mismo motor.
- La restauración destructiva exige cuidado operativo (no se expone por HTTP).
- El respaldo a "carpeta sincronizada" depende de que el cliente tenga instalado
  y logueado Drive/OneDrive Desktop; es responsabilidad del cliente.

## Alternativas consideradas

- **Sincronizar el `.sqlite`/data dir por Drive/OneDrive** — corrompe la base
  (ver Contexto). Descartado.
- **`pg_dump` como único mecanismo** — más eficiente, pero ata el respaldo a
  tener las herramientas de PostgreSQL instaladas y a la plataforma. Se reserva
  como `Origen` alternativo, no como base del MVP.
- **Sólo backup manual (export/import)** — simple pero frágil: depende de que
  alguien se acuerde. Se mantiene como opción, pero el destino + scheduler
  automatizan el caso común.
- **Integrar la API de Drive/Graph desde el día uno** — más trabajo (OAuth, app
  registrada, refresh de tokens) sin beneficio claro frente a la carpeta
  sincronizada para el MVP. Diferido a `DestinoNubeAPI`.
