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

/** El comando sale con este código cuando no encuentra servidor instalado. */
const SIN_INSTALACION = 3;

export interface ResultadoActualizarServidor {
  readonly ok: boolean;
  readonly detalle: string;
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
      return { ok: true, detalle: "Servidor actualizado y respondiendo OK." };
    }
    if (resultado.code === SIN_INSTALACION) {
      return {
        ok: false,
        detalle:
          "No encontré el servidor instalado en esta PC (ni en C:\\NexoSoft-Servidor ni en C:\\NexoSoft). Si el servidor corre en otra máquina, actualizalo desde ahí.",
      };
    }
    return {
      ok: false,
      detalle: `El script terminó con error (código ${resultado.code ?? "desconocido"}). El detalle está en el log: C:\\NexoSoft-Servidor\\logs\\actualizador.log (o la carpeta "logs" del repo si el servidor se instaló con git).`,
    };
  } catch (e) {
    return { ok: false, detalle: e instanceof Error ? e.message : String(e) };
  }
}
