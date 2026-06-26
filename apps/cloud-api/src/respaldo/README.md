# Módulo `respaldo`

Respaldo de la base del servidor de sucursal hacia la **nube propia del cliente**
(o disco externo / NAS), sin acoplarse a ninguna API externa.
Implementa [ADR-0020](../../../../docs/adr/0020-respaldo-en-nube-propia.md).

## Idea central

> Sincronizar el archivo de base "vivo" por Google Drive / OneDrive **corrompe la
> base**. Por eso respaldamos con **snapshots consistentes**, no copiando el
> archivo en uso.

El motor lee todas las tablas dentro de una **transacción** (lectura
consistente), serializa a JSON, comprime con **gzip** (zlib nativo, sin
dependencias), agrega metadatos (versión, fecha, checksum SHA-256) y entrega el
resultado a un **destino intercambiable**.

## Piezas

| Pieza                  | Rol                                                            |
| ---------------------- | ------------------------------------------------------------- |
| `DestinoDeRespaldo`    | Puerto: `escribir`/`leer`/`listar`/`eliminar`                 |
| `DestinoCarpeta`       | Filesystem: disco local, NAS o carpeta de Drive/OneDrive      |
| `DestinoEnMemoria`     | Mock funcional para tests                                     |
| `MotorDeRespaldo`      | Snapshot + compresión + retención + restauración              |
| `RespaldoSchedulerService` | Respaldo automático según cron (`RESPALDO_CRON`)          |

Para respaldar a la nube propia, basta apuntar `RESPALDO_RUTA` a la carpeta local
que Google Drive / OneDrive Desktop sincroniza. El sistema no sabe (ni necesita
saber) que esa carpeta está en la nube.

## Configuración (`.env`)

```bash
RESPALDO_RUTA=./respaldos      # carpeta destino (puede ser la de Drive/OneDrive)
RESPALDO_RETENER=7             # cuántos snapshots conservar
RESPALDO_CRON=                 # cron del respaldo automático; vacío = sólo manual
# Ej.: RESPALDO_CRON="0 23 * * *"  → todos los días a las 23:00
```

## Endpoints

| Método | Ruta                | Acción                       |
| ------ | ------------------- | ---------------------------- |
| `POST` | `/api/v1/respaldo`  | Crea un respaldo ahora       |
| `GET`  | `/api/v1/respaldo`  | Lista los respaldos          |

La **restauración es destructiva** (reemplaza toda la base) y **no se expone por
HTTP**: vive como `MotorDeRespaldo.restaurar(nombre)` para una herramienta de
administración. Verifica versión y checksum antes de tocar nada, y corre dentro
de una transacción (todo o nada).

## Extender a otra nube (futuro)

Agregar `DestinoNubeAPI` (OAuth a Google Drive / Microsoft Graph) implementando
`DestinoDeRespaldo`, sin tocar el motor ni el resto del sistema. Falta para
producción: registrar la app, manejar tokens y refresh.

## Qué NO es

No es **sincronización entre terminales** (eso es la cola de operaciones,
[ADR-0005](../../../../docs/adr/0005-sincronizacion-offline-first.md), Fase 4.5).
Respaldo = recuperación ante desastre. Sync = compartir datos en vivo.
