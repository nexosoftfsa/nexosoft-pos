/**
 * Actualización del servidor de sucursal (cloud-api + panel web) disparada
 * desde el POS. A diferencia de `actualizaciones.ts` (que reemplaza un
 * .exe, atómico), esto corre un script elevado que hace git pull + migra la
 * base + recompila + reinicia el servicio — más lento y con más superficie
 * de fallo, por eso vive separado y requiere confirmación explícita del
 * usuario en la UI (`Actualizaciones.tsx`), nunca se dispara solo.
 *
 * El comando "actualizar-servidor" y sus argumentos están fijados en
 * `src-tauri/capabilities/default.json` (permiso `shell:allow-execute`
 * con scope) — el string de acá tiene que matchear EXACTO con esa
 * configuración, si no Tauri lo rechaza. Ver ese archivo y
 * `scripts/actualizacion/actualizar-servidor.ps1` (el script real que
 * corre elevado) para el detalle completo.
 */
import { estaEnTauri } from "./ejecutor-sql-tauri";

/**
 * Hay DOS formas de instalar el servidor y cada una se actualiza distinto:
 *
 *  - **Standalone** (`C:\NexoSoft-Servidor`, el instalador con Node y
 *    PostgreSQL embebidos): trae su propio `actualizador-servidor.ps1`, que
 *    baja el release nuevo, migra y revierte solo si algo falla.
 *  - **Legacy** (`C:\NexoSoft`, repo clonado): usa el script de siempre, con
 *    `git pull` + `pnpm install` + build.
 *
 * El comando de acá elige según lo que exista en la PC. Antes apuntaba fijo
 * al legacy, así que en una instalación standalone el botón fallaba con un
 * código sin sentido y mandaba a mirar un log que nunca se había escrito.
 *
 * Los argumentos están fijados en `src-tauri/capabilities/default.json` y
 * tienen que matchear EXACTO con este string (Tauri lo rechaza si no).
 */
export const ARGS_ACTUALIZAR_SERVIDOR = [
  "-NoProfile",
  "-Command",
  "$standalone='C:\\NexoSoft-Servidor\\scripts\\actualizador-servidor.ps1'; $legacy='C:\\NexoSoft\\scripts\\actualizacion\\actualizar-servidor.ps1'; if (Test-Path $standalone) { $a=@('-NoProfile','-ExecutionPolicy','Bypass','-File',$standalone,'-ServidorDir','C:\\NexoSoft-Servidor\\dist-servidor','-NodeDir','C:\\NexoSoft-Servidor\\node-portable') } elseif (Test-Path $legacy) { $a=@('-NoProfile','-ExecutionPolicy','Bypass','-File',$legacy) } else { exit 3 }; $p=Start-Process -FilePath powershell.exe -ArgumentList $a -Verb RunAs -Wait -PassThru; exit $p.ExitCode",
];

const LOG = 'C:\\NexoSoft-Servidor\\logs\\actualizador.log (o la carpeta "logs" del repo si el servidor se instaló con git)';

/**
 * Cada código de salida del actualizador corresponde a una acción distinta de
 * quien está adelante de la máquina — no es lo mismo "no pasó nada, seguí
 * trabajando" que "el servidor quedó caído". Los define
 * `scripts/instalacion/actualizador-servidor.ps1`: si se agrega uno hay que
 * tocar los dos lados.
 *
 * Antes acá solo se mostraba el número, y un `código 1` podía ser cualquier
 * cosa; peor todavía, el script devolvía 1 hasta cuando había salido todo bien.
 */
const MENSAJES: Readonly<Record<number, string>> = {
  3: "No encontré el servidor instalado en esta PC (ni en C:\\NexoSoft-Servidor ni en C:\\NexoSoft). Si el servidor corre en otra máquina, actualizalo desde ahí.",
  4: "No se pudo cerrar el servidor para actualizarlo, así que no se tocó nada: seguís trabajando con la versión de siempre. Probá de nuevo con el negocio cerrado, o reiniciá la PC y volvé a intentar.",
  5: "La actualización falló y no se pudo volver a la versión anterior: EL SERVIDOR ESTÁ CAÍDO y las terminales no van a poder vender contra él. Avisá a soporte ahora. El detalle está en el log: " +
    LOG,
  6: "No se pudo consultar ni descargar la actualización. Revisá que esta PC tenga internet y probá de nuevo. No se cambió nada.",
  7: "La instalación del servidor está incompleta: falta la carpeta del programa. Puede haber quedado por la mitad una actualización anterior. El log dice cómo recuperarla: " +
    LOG,
  8: "La actualización falló y se volvió sola a la versión anterior, que quedó funcionando. No perdiste nada. El motivo está en el log: " +
    LOG,
};

export interface ResultadoActualizarServidor {
  readonly ok: boolean;
  readonly detalle: string;
}

/** Qué decirle a la persona según cómo terminó el script. */
export function detalleDeSalida(codigo: number | null): string {
  if (codigo !== null && codigo in MENSAJES) return MENSAJES[codigo] as string;
  return `El script terminó con error (código ${codigo ?? "desconocido"}). El detalle está en el log: ${LOG}.`;
}

/**
 * `true` si esta terminal es la que además aloja el servidor (Caja, en la
 * convención de instalación) — la única donde tiene sentido ofrecer
 * "Actualizar servidor". Depósito/Oficina solo consumen el servidor por la
 * LAN, actualizarlo desde ahí no correspondería.
 */
export function esServidorLocal(servidorUrl: string): boolean {
  try {
    const host = new URL(servidorUrl).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

/**
 * Dispara el script de actualización del servidor (elevado, con UAC). Se
 * queda esperando a que termine — puede tardar varios minutos (git pull,
 * npm install, migración, build). No hace nada fuera de Tauri.
 */
export async function actualizarServidor(): Promise<ResultadoActualizarServidor> {
  if (!estaEnTauri()) {
    return { ok: false, detalle: "Solo disponible en la app instalada." };
  }
  const { Command } = await import("@tauri-apps/plugin-shell");
  try {
    const comando = Command.create("actualizar-servidor", ARGS_ACTUALIZAR_SERVIDOR);
    const resultado = await comando.execute();
    if (resultado.code === 0) {
      // Salida 0 cubre tanto "se actualizó" como "ya estaba al día": el script
      // no distingue, y la versión que quedó se ve arriba, en el panel.
      return { ok: true, detalle: "Listo: el servidor quedó en la última versión y responde bien." };
    }
    return { ok: false, detalle: detalleDeSalida(resultado.code) };
  } catch (e) {
    return { ok: false, detalle: e instanceof Error ? e.message : String(e) };
  }
}
