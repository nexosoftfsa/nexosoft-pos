# ADR-0053: Botón "Actualizar servidor" en el POS, vía script elevado con scope fijo

- **Estado:** Aceptada
- **Fecha:** 2026-08-19
- **Decisores:** Equipo NexoSoft
- **Relacionada:** ADR-0019 (servidor de sucursal en LAN), ADR-0020 (respaldo en nube propia)

## Contexto

El POS ya tenía auto-actualización (Tauri updater, ver `datos/actualizaciones.ts`):
descarga y reemplaza el `.exe` — atómico, si algo sale mal el usuario sigue
con la versión anterior funcionando. El **servidor** (`cloud-api`, corriendo
como tarea programada de Windows en la PC de Caja) no tenía ningún mecanismo
de auto-actualización: se actualizaba a mano, comando por comando, siguiendo
la guía de `docs/instalacion-primer-cliente.md`.

El pedido fue que el botón de actualizar del POS también pudiera actualizar
el servidor. La dificultad no es técnica sino de **riesgo**: actualizar el
servidor implica `git pull` + migrar la base de datos (cambio de esquema,
irreversible si algo sale mal a mitad de camino) + recompilar + reiniciar un
proceso que corre como `SYSTEM` — nada de esto es "reemplazar un archivo".

## Decisión

Un botón nuevo, **separado y explícito** ("Actualizar servidor"), visible
solo en `Actualizaciones.tsx` cuando la terminal es la que además aloja el
servidor (`esServidorLocal()`: el `servidorUrl` configurado resuelve a
`localhost`/`127.0.0.1` — en Depósito/Oficina, que solo consumen el servidor
por la LAN, el botón no aparece).

Al tocarlo:

1. Diálogo de confirmación explícito (`@tauri-apps/plugin-dialog`) — nunca
   se dispara solo, a diferencia del chequeo de actualizaciones del POS.
2. El POS ejecuta un comando **con scope fijo** (`@tauri-apps/plugin-shell`,
   permiso `shell:allow-execute` con `args` 100% fijos en
   `src-tauri/capabilities/default.json` — no hay ningún dato dinámico del
   frontend en el comando, cero superficie de inyección) que lanza
   `scripts/actualizacion/actualizar-servidor.ps1` **elevado**
   (`Start-Process -Verb RunAs`, dispara el UAC nativo de Windows).
3. Ese script (corre como Administrador, fuera del proceso del POS):
   aborta si el repo tiene cambios sin commitear; hace un **respaldo SQL**
   con `pg_dump` antes de migrar (best-effort: si `pg_dump` no está en el
   PATH, avisa y sigue, no bloquea); `git pull --ff-only`; `pnpm install`;
   `prisma migrate deploy`; recompila `cloud-api` y `admin-web`; reinicia la
   tarea programada (`NexoSoft cloud-api`); espera y verifica `/health`
   antes de darse por terminado. Todo el proceso queda en un log con
   `Start-Transcript` en `logs/`.
4. El POS solo ve el código de salida del script (0 = OK) — no intenta
   capturar la salida en vivo del proceso elevado (una limitación real de
   Windows: un proceso lanzado con `-Verb RunAs` abre su propia consola, su
   stdout no fluye al padre no-elevado). El detalle completo queda en el log.

## Consecuencias

### Positivas
- Cierra el hueco real: hoy no alcanza con actualizar el POS si la versión
  nueva depende de endpoints que el servidor viejo no tiene (como pasó con
  Fase 15.A: `/usuarios/:id/foto` y `/usuarios/:id/credencial`).
- El scope del comando es fijo en tiempo de compilación — el frontend no
  puede construir ni alterar el comando que se ejecuta, ni con un bug ni con
  una futura vulnerabilidad XSS/inyección en la UI.
- Reusa la tarea programada y la convención de instalación ya existentes
  (`instalar-servicio-servidor.ps1`, `C:\NexoSoft`) — no inventa un segundo
  mecanismo de despliegue.
- El respaldo antes de migrar es automático, no depende de que el operador
  se acuerde de correrlo a mano.

### Negativas / costos
- Asume la convención de instalación `C:\NexoSoft` (documentada en
  `instalacion-primer-cliente.md`) — el path del script está fijo en el
  scope de la capability. Si algún día se instala en otro lado, este botón
  específico no lo encuentra (el resto del sistema no depende de esto).
- Requiere UAC: el operador tiene que aprobar el diálogo de Windows. No hay
  forma de saltear eso sin correr el POS como Administrador (que no
  queremos — el instalador usa `installMode: currentUser` a propósito).
- Sin captura de salida en vivo en la UI del POS — para ver el detalle de un
  fallo hay que abrir el log en `logs/`. Aceptado por ahora: mostrar el
  progreso en tiempo real de un proceso elevado externo es sustancialmente
  más complejo (requeriría IPC entre el proceso elevado y el POS) y no vale
  la pena para una operación que un ADMIN corre a mano, ocasionalmente,
  mirando la pantalla.
- Como con cualquier `git pull --ff-only`: si el remoto tiene commits que
  divergen de lo que hay en la PC del cliente (por ejemplo, alguien tocó
  algo a mano ahí), el script aborta en vez de forzar — hay que resolverlo
  manualmente. Comportamiento deliberado, preferible a sobreescribir algo.

## Alternativas consideradas

- **Que el mismo botón de "Buscar actualizaciones" del POS dispare las dos
  cosas junto** — descartado: mezclaría una operación atómica y segura (swap
  de exe) con una que puede fallar a mitad de camino y dejar el servidor
  caído; el operador necesita poder elegir el momento (cerrar el local,
  sin ventas activas) para la parte de servidor.
- **Servicio de Windows real en vez de tarea programada** — se mantuvo la
  tarea programada ya existente (`instalar-servicio-servidor.ps1`); migrar a
  un servicio de Windows de verdad es un cambio ortogonal, no necesario para
  esto.
- **Ejecutar el script sin elevar, y que el operador lo eleve a mano
  cuando haga falta** — más simple de implementar, pero no cumple el pedido
  concreto de "que el botón del POS lo haga"; con el scope fijo del comando,
  elevar automáticamente no agrega riesgo real (el usuario ya tiene que
  aprobar el UAC, y lo que se ejecuta está fijado en el binario, no lo
  decide el frontend en tiempo de ejecución).
