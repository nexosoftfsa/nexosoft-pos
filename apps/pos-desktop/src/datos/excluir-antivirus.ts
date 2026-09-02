/**
 * Excluir las carpetas de NexoSoft del antivirus, desde el POS.
 *
 * Hace falta porque el ejecutable del POS **no está firmado** con un
 * certificado de código: un `.exe` sin firma, recién bajado y viviendo en
 * `AppData\Local`, es el perfil que los antivirus marcan por heurística. Pasó
 * de verdad: Defender se llevó `nexosoft-pos.exe` a cuarentena y la terminal
 * dejó de abrir.
 *
 * Es una acción **manual y explícita**, no algo que corra solo al instalar.
 * Excluir una carpeta del antivirus baja la protección de esa carpeta, y eso
 * no puede pasar sin que alguien lo decida: el UAC es esa decisión.
 *
 * El comando y sus argumentos están fijados en
 * `src-tauri/capabilities/default.json` — el string de acá tiene que matchear
 * EXACTO, si no Tauri lo rechaza.
 */
import { estaEnTauri } from "./ejecutor-sql-tauri";

export const ARGS_EXCLUIR_ANTIVIRUS = [
  "-NoProfile",
  "-Command",
  // Se busca en los tres lugares posibles en vez de apostar a uno: Tauri puede
  // dejar el recurso junto al .exe o en `resources\`, y en la PC del servidor
  // el script también viaja con el paquete del servidor.
  //
  // Las rutas van ENTRECOMILLADAS a mano. `Start-Process -ArgumentList` con un
  // array pega los argumentos con espacios y no entrecomilla nada, y nuestra
  // carpeta se llama "NexoSoft POS": sin las comillas, PowerShell recibía
  // `-File C:\...\NexoSoft` y salía con -196608 ("el archivo de -File no
  // existe"), aunque el `Test-Path` de acá arriba hubiera dado verdadero.
  "$pos=Join-Path $env:LOCALAPPDATA 'NexoSoft POS'; $c=@((Join-Path $pos 'excluir-antivirus.ps1'),(Join-Path $pos 'resources\\excluir-antivirus.ps1'),'C:\\NexoSoft-Servidor\\scripts\\excluir-antivirus.ps1'); $s=$c | Where-Object { Test-Path $_ } | Select-Object -First 1; if (-not $s) { exit 3 }; $a=@('-NoProfile','-ExecutionPolicy','Bypass','-File',('\"'+$s+'\"'),'-CarpetaPos',('\"'+$pos+'\"')); $p=Start-Process -FilePath powershell.exe -ArgumentList $a -Verb RunAs -Wait -PassThru; exit $p.ExitCode",
];

const LOG = "C:\\ProgramData\\NexoSoft\\logs\\antivirus.log";

/**
 * Los define `scripts/instalacion/excluir-antivirus.ps1`: si se agrega uno hay
 * que tocar los dos lados.
 */
const MENSAJES: Readonly<Record<number, string>> = {
  2: "Hace falta aceptar el permiso de administrador de Windows. Probá de nuevo y tocá «Sí» cuando aparezca.",
  3: "No encontré el archivo que hace la exclusión. Reinstalá el POS desde el instalador y probá de nuevo.",
  4:
    "Esta PC tiene un antivirus que no es Windows Defender, y ésos no permiten configurarlos desde afuera: " +
    "hay que agregar la exclusión a mano en ese antivirus. El detalle de cuál es está en el log: " +
    LOG,
  5: "No se pudo completar. El detalle está en el log: " + LOG,
};

export interface ResultadoExclusion {
  readonly ok: boolean;
  readonly detalle: string;
}

export function detalleDeSalida(codigo: number | null): string {
  if (codigo !== null && codigo in MENSAJES) return MENSAJES[codigo] as string;
  return `Terminó con error (código ${codigo ?? "desconocido"}). El detalle está en el log: ${LOG}.`;
}

/**
 * Corre el script elevado (con UAC) y espera a que termine. Además de agregar
 * las exclusiones, **intenta recuperar lo que el antivirus ya se haya llevado a
 * cuarentena**: una exclusión sola no devuelve el archivo borrado, así que sin
 * eso la terminal seguiría sin abrir.
 */
export async function excluirDelAntivirus(): Promise<ResultadoExclusion> {
  if (!estaEnTauri()) {
    return { ok: false, detalle: "Solo disponible en la app instalada." };
  }
  const { Command } = await import("@tauri-apps/plugin-shell");
  try {
    const resultado = await Command.create(
      "excluir-antivirus",
      ARGS_EXCLUIR_ANTIVIRUS,
    ).execute();
    if (resultado.code === 0) {
      return {
        ok: true,
        detalle:
          "Listo: las carpetas de NexoSoft quedaron excluidas de Windows Defender, y se pidió restaurar lo que hubiera en cuarentena.",
      };
    }
    return { ok: false, detalle: detalleDeSalida(resultado.code) };
  } catch (e) {
    return { ok: false, detalle: e instanceof Error ? e.message : String(e) };
  }
}
