/**
 * ¿La corrida de sincronización llegó al servidor de sucursal?
 *
 * `MotorDeSincronizacion.sincronizar()` **no lanza** cuando no hay red: captura
 * el fallo de transporte y marca todas las operaciones del lote como
 * reintentables, con el mismo mensaje. Desde afuera, ese resumen se parece
 * bastante a uno donde el servidor rechazó todo — pero no es lo mismo, y la
 * diferencia es justo lo que el cajero necesita ver en la barra de estado.
 *
 * La regla: **llegamos si alguna operación quedó resuelta.** Una que el
 * servidor aceptó (`ok`), o una que rechazó de forma definitiva
 * (`reintentable: false`, un payload que no puede entrar nunca), sólo puede
 * venir de una respuesta del servidor. Si todas quedaron pendientes de
 * reintento, no hubo respuesta.
 *
 * Esto reemplaza a `navigator.onLine`, que respondía otra pregunta: si hay
 * INTERNET. El servidor de sucursal vive en la LAN, muchas veces en la misma
 * PC, así que un corte de internet no lo toca.
 */
import type { ResumenSync } from "@nexosoft/sync";

export function llegoAlServidor(resumen: ResumenSync): boolean {
  const resueltas = Object.values(resumen.resultados).filter(
    (r) => r.ok || !r.reintentable,
  );
  return resueltas.length > 0;
}
