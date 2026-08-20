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

const ARGS_ACTUALIZAR_SERVIDOR = [
  "-NoProfile",
  "-Command",
  "$p = Start-Process -FilePath powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File','C:\\NexoSoft\\scripts\\actualizacion\\actualizar-servidor.ps1') -Verb RunAs -Wait -PassThru; exit $p.ExitCode",
];

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
    return {
      ok: false,
      detalle: `El script terminó con error (código ${resultado.code ?? "desconocido"}). Revisá el log en la carpeta "logs" del servidor.`,
    };
  } catch (e) {
    return { ok: false, detalle: e instanceof Error ? e.message : String(e) };
  }
}
