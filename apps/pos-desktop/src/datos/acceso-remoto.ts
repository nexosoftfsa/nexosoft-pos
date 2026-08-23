/**
 * Acceso remoto al panel (Fase 17.A, ADR-0055): alta, baja y reactivación del
 * túnel de Cloudflare de este comercio, desde la pantalla de Configuración.
 *
 * El trabajo real lo hace `scripts/instalacion/instalar-acceso-remoto.ps1`
 * corriendo **elevado** (`Start-Process -Verb RunAs`, UAC nativo de Windows),
 * igual que el botón "Actualizar servidor" (ADR-0053): registrar una tarea
 * programada y escribir en ProgramData no se puede desde el proceso del POS.
 *
 * Los comandos y sus argumentos están fijados en
 * `src-tauri/capabilities/default.json`. El único dato que viaja del frontend
 * al comando es el **código de activación**, y va detrás de un `validator`
 * de Tauri que solo acepta base64 (`[A-Za-z0-9+/=]`): sin comillas, espacios,
 * `;`, `$` ni backticks, no hay forma de que se escape del `'...'` donde
 * queda embebido. Ver el ADR para por qué esta es la única excepción a los
 * argumentos 100% fijos de ADR-0053.
 */
import { estaEnTauri } from "./ejecutor-sql-tauri";

/** Charset del código de activación. Tiene que ser idéntico al `validator` de las capabilities. */
export const VALIDADOR_CODIGO = "^[A-Za-z0-9+/=]{20,4096}$";

/**
 * Resuelve las dos formas de instalar el servidor (standalone en
 * `C:\NexoSoft-Servidor`, legacy con el repo en `C:\NexoSoft`) y lanza el
 * script elevado. Mismo patrón que ARGS_ACTUALIZAR_SERVIDOR.
 */
function comando(accion: "activar" | "desactivar", conCodigo: boolean): string {
  const argumentos = conCodigo
    ? `@('-NoProfile','-ExecutionPolicy','Bypass','-File',$s,'-Accion','${accion}','-Codigo',$codigo)`
    : `@('-NoProfile','-ExecutionPolicy','Bypass','-File',$s,'-Accion','${accion}')`;
  return (
    `$standalone='C:\\NexoSoft-Servidor\\scripts\\instalar-acceso-remoto.ps1'; ` +
    `$legacy='C:\\NexoSoft\\scripts\\instalacion\\instalar-acceso-remoto.ps1'; ` +
    `if (Test-Path $standalone) { $s=$standalone } elseif (Test-Path $legacy) { $s=$legacy } else { exit 2 }; ` +
    `$a=${argumentos}; ` +
    `$p=Start-Process -FilePath powershell.exe -ArgumentList $a -Verb RunAs -Wait -PassThru; exit $p.ExitCode`
  );
}

/**
 * Alta con código: PowerShell junta en un solo string todo lo que viene
 * después de `-Command`, así que el código queda embebido entre las comillas
 * simples que abren y cierran los argumentos fijos de al lado. El `.Trim()`
 * es porque ese armado mete un espacio a cada costado.
 */
export const ARGS_ACTIVAR_ACCESO_REMOTO: ReadonlyArray<string | { readonly validator: string }> = [
  "-NoProfile",
  "-Command",
  "$codigo='",
  { validator: VALIDADOR_CODIGO },
  `'.Trim(); ${comando("activar", true)}`,
];

/** Reactivar usa el token ya guardado en la PC — no viaja ningún dato del frontend. */
export const ARGS_REACTIVAR_ACCESO_REMOTO: readonly string[] = [
  "-NoProfile",
  "-Command",
  comando("activar", false),
];

export const ARGS_DESACTIVAR_ACCESO_REMOTO: readonly string[] = [
  "-NoProfile",
  "-Command",
  comando("desactivar", false),
];

/** Códigos de salida de instalar-acceso-remoto.ps1 (y del envoltorio de arriba). */
const SIN_INSTALACION = 2;
const SIN_CODIGO = 3;
const SIN_CLOUDFLARED = 4;
const NO_RESPONDE = 5;
const CODIGO_INVALIDO = 6;

export interface ResultadoAccesoRemoto {
  readonly ok: boolean;
  readonly detalle: string;
}

/**
 * Valida el código antes de disparar el UAC: si el dueño pegó cualquier cosa,
 * es mejor decírselo en el acto que después de un diálogo de Windows y una
 * espera. Devuelve `null` si está bien, o el mensaje de error.
 */
export function validarCodigoActivacion(codigo: string): string | null {
  const limpio = codigo.trim();
  if (limpio === "") return "Pegá el código de activación que te pasamos.";
  if (!new RegExp(VALIDADOR_CODIGO).test(limpio)) {
    return "Ese código no tiene el formato esperado. Copialo de nuevo, completo y sin espacios.";
  }
  let json: string;
  try {
    json = atob(limpio);
  } catch {
    return "Ese código no se pudo leer. Copialo de nuevo, completo.";
  }
  let datos: unknown;
  try {
    datos = JSON.parse(json);
  } catch {
    return "Ese código no se pudo leer. Copialo de nuevo, completo.";
  }
  const { hostname, tunnelId, credenciales } = datos as {
    hostname?: unknown;
    tunnelId?: unknown;
    credenciales?: { TunnelSecret?: unknown };
  };
  if (typeof hostname !== "string" || !/^[a-z0-9-]+\.nexosoft\.com\.ar$/.test(hostname)) {
    return "Ese código no corresponde a una dirección de NexoSoft.";
  }
  // Las credenciales del túnel son lo que hace falta para levantarlo: sin
  // ellas el código no sirve para nada.
  if (
    typeof tunnelId !== "string" ||
    tunnelId.trim() === "" ||
    typeof credenciales?.TunnelSecret !== "string" ||
    credenciales.TunnelSecret.trim() === ""
  ) {
    return "Ese código está incompleto. Pedilo de nuevo.";
  }
  return null;
}

/** La dirección pública que trae un código válido, para mostrarla antes de activar. */
export function hostnameDelCodigo(codigo: string): string | null {
  if (validarCodigoActivacion(codigo) !== null) return null;
  return (JSON.parse(atob(codigo.trim())) as { hostname: string }).hostname;
}

function explicar(codigo: number | null): string {
  switch (codigo) {
    case SIN_INSTALACION:
      return "No encontré el servidor instalado en esta PC. El acceso remoto se configura en la PC que aloja el servidor.";
    case SIN_CODIGO:
      return "Esta PC no tiene acceso remoto dado de alta. Pedile el código de activación a NexoSoft.";
    case SIN_CLOUDFLARED:
      return "No se pudo descargar el componente del túnel. Revisá que la PC tenga internet y probá de nuevo.";
    case NO_RESPONDE:
      return "Quedó instalado, pero la dirección todavía no responde desde afuera. Puede tardar unos minutos; si sigue así, avisanos.";
    case CODIGO_INVALIDO:
      return "El código de activación no es válido. Pedilo de nuevo a NexoSoft.";
    default:
      return `El script terminó con error (código ${codigo ?? "desconocido"}). El detalle está en C:\\ProgramData\\NexoSoft\\logs\\acceso-remoto.log.`;
  }
}

async function ejecutar(nombre: string, args: string[]): Promise<ResultadoAccesoRemoto> {
  if (!estaEnTauri()) return { ok: false, detalle: "Solo disponible en la app instalada." };
  const { Command } = await import("@tauri-apps/plugin-shell");
  try {
    const resultado = await Command.create(nombre, args).execute();
    if (resultado.code === 0) return { ok: true, detalle: "" };
    return { ok: false, detalle: explicar(resultado.code) };
  } catch (e) {
    return { ok: false, detalle: e instanceof Error ? e.message : String(e) };
  }
}

/** Da de alta el acceso remoto con el código que nos pidió el comercio. */
export async function activarAccesoRemoto(codigo: string): Promise<ResultadoAccesoRemoto> {
  const error = validarCodigoActivacion(codigo);
  if (error !== null) return { ok: false, detalle: error };
  const args = ARGS_ACTIVAR_ACCESO_REMOTO.map((a) => (typeof a === "string" ? a : codigo.trim()));
  const r = await ejecutar("acceso-remoto-activar", args);
  return r.ok ? { ok: true, detalle: "Acceso remoto activado." } : r;
}

/** Vuelve a levantar el túnel con el token ya guardado en esta PC. */
export async function reactivarAccesoRemoto(): Promise<ResultadoAccesoRemoto> {
  const r = await ejecutar("acceso-remoto-reactivar", [...ARGS_REACTIVAR_ACCESO_REMOTO]);
  return r.ok ? { ok: true, detalle: "Acceso remoto activado." } : r;
}

/** Apaga el túnel: el panel vuelve a verse solo desde la red del local. */
export async function desactivarAccesoRemoto(): Promise<ResultadoAccesoRemoto> {
  const r = await ejecutar("acceso-remoto-desactivar", [...ARGS_DESACTIVAR_ACCESO_REMOTO]);
  return r.ok ? { ok: true, detalle: "Acceso remoto desactivado." } : r;
}
