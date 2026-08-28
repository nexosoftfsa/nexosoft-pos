/**
 * Adaptador real de `ImpresoraTermica`: arma el ticket en ESC/POS y se lo
 * manda al spooler de Windows en modo RAW (comando nativo `imprimir_escpos`,
 * ver `src-tauri/src/impresion.rs`).
 *
 * Reemplaza a `MockImpresoraTermica` en la app instalada. La diferencia real
 * con imprimir el HTML por `window.print()`: el papel avanza exactamente lo
 * que se imprimió y la impresora corta por comando, sin diálogo de Windows ni
 * tamaño de papel fijo.
 */
import {
  construirEscPos,
  PUNTOS_POR_COLUMNA,
  type DatosTicket,
  type EstadoImpresora,
  type ImpresoraTermica,
  type LogoRaster,
} from "@nexosoft/hardware";

/**
 * Convierte el logo del comercio (data URL PNG/JPG) a mapa de bits monocromo
 * para `GS v 0`. Una térmica imprime un solo color: cada punto es negro o
 * nada, así que se pasa a gris y se umbraliza.
 *
 * Devuelve `null` si el logo no se puede leer — un ticket sin logo es mucho
 * mejor que una venta que no se imprime.
 */
export async function logoARaster(
  dataUrl: string,
  anchoMaxPuntos: number,
): Promise<LogoRaster | null> {
  try {
    const img = new Image();
    await new Promise<void>((resolver, rechazar) => {
      img.onload = () => resolver();
      img.onerror = () => rechazar(new Error("logo ilegible"));
      img.src = dataUrl;
    });
    if (img.width === 0 || img.height === 0) return null;

    const escala = Math.min(1, anchoMaxPuntos / img.width);
    const ancho = Math.max(1, Math.floor(img.width * escala));
    const alto = Math.max(1, Math.floor(img.height * escala));

    const lienzo = document.createElement("canvas");
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext("2d");
    if (!ctx) return null;
    // Fondo blanco: un PNG con transparencia daría puntos negros en el papel.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, ancho, alto);
    ctx.drawImage(img, 0, 0, ancho, alto);

    const { data } = ctx.getImageData(0, 0, ancho, alto);
    const bytesPorFila = Math.ceil(ancho / 8);
    const bits = new Uint8Array(bytesPorFila * alto);
    for (let y = 0; y < alto; y++) {
      for (let x = 0; x < ancho; x++) {
        const i = (y * ancho + x) * 4;
        // Luminancia perceptual; por debajo del umbral, punto negro.
        const luz = data[i]! * 0.299 + data[i + 1]! * 0.587 + data[i + 2]! * 0.114;
        if (luz < 128) bits[y * bytesPorFila + (x >> 3)]! |= 0x80 >> (x & 7);
      }
    }
    return { anchoPuntos: ancho, alto, bits };
  } catch {
    return null;
  }
}

/** Nombre de la impresora en Windows; vacío = la predeterminada del sistema. */
const CLAVE_IMPRESORA = "nexosoft.impresoraTicket";

export function nombreImpresoraConfigurada(): string {
  try {
    return localStorage.getItem(CLAVE_IMPRESORA) ?? "";
  } catch {
    return "";
  }
}

export function configurarImpresora(nombre: string): void {
  try {
    localStorage.setItem(CLAVE_IMPRESORA, nombre.trim());
  } catch {
    // Sin localStorage se usa la predeterminada de Windows.
  }
  // Cambió el destino: lo que sabíamos de él ya no vale.
  olvidarImpresoras();
}

/**
 * El destino del ticket no sirve para ESC/POS.
 *
 * Es una situación esperada, no una falla: un comercio que todavía no conectó
 * la térmica (o una PC de prueba) tiene que poder vender igual. Quien lo reciba
 * decide qué hacer — el POS cae en la vista imprimible.
 */
export class ErrorImpresoraVirtual extends Error {
  constructor(readonly impresora: string) {
    super(
      `"${impresora}" es una impresora virtual: guarda el trabajo en un archivo en vez de imprimirlo.`,
    );
    this.name = "ErrorImpresoraVirtual";
  }
}

/** Una impresora instalada en Windows, como la devuelve el comando nativo. */
export interface ImpresoraDelSistema {
  readonly nombre: string;
  readonly puerto: string;
  readonly driver: string;
  /**
   * `false` en las impresoras virtuales (Microsoft Print to PDF, XPS, OneNote,
   * fax): guardan el trabajo en un archivo, así que el ESC/POS termina en un
   * `.pdf` que no abre nadie. Ver `src-tauri/src/impresion.rs`.
   */
  readonly sirveParaTicket: boolean;
  readonly predeterminada: boolean;
}

/** Lo que devuelve el comando nativo, en snake_case. */
interface ImpresoraCruda {
  readonly nombre: string;
  readonly puerto: string;
  readonly driver: string;
  readonly sirve_para_ticket: boolean;
  readonly predeterminada: boolean;
}

/** Impresoras instaladas en Windows, para elegir la térmica en Configuración. */
export async function listarImpresoras(): Promise<ImpresoraDelSistema[]> {
  const { invoke } = await import("@tauri-apps/api/core");
  const crudas = await invoke<ImpresoraCruda[]>("listar_impresoras");
  return crudas.map((i) => ({
    nombre: i.nombre,
    puerto: i.puerto,
    driver: i.driver,
    sirveParaTicket: i.sirve_para_ticket,
    predeterminada: i.predeterminada,
  }));
}

/**
 * Se cachea porque esto se consulta en CADA venta, y la lista de impresoras de
 * una caja no cambia mientras el POS está abierto. Se olvida al elegir otra.
 */
let cacheImpresoras: readonly ImpresoraDelSistema[] | null = null;

export function olvidarImpresoras(): void {
  cacheImpresoras = null;
}

async function impresorasCacheadas(): Promise<readonly ImpresoraDelSistema[]> {
  cacheImpresoras ??= await listarImpresoras();
  return cacheImpresoras;
}

/**
 * Se queja si el ticket iba a salir a una impresora virtual.
 *
 * El mismo control existe en Rust (`imprimir_raw`), que es el que de verdad
 * protege. Este de acá está para poder distinguir el caso ANTES de mandar y
 * reaccionar distinto: un destino que no sirve no es un error de impresión, es
 * una caja sin térmica.
 *
 * Si no se puede averiguar (no hay comando nativo, falla la consulta) se deja
 * pasar: el control de Rust sigue estando, y una duda nuestra no puede frenar
 * una venta.
 */
async function verificarDestino(): Promise<void> {
  let destino: string;
  try {
    destino = await impresoraEfectiva();
  } catch {
    return;
  }
  let instaladas: readonly ImpresoraDelSistema[];
  try {
    instaladas = await impresorasCacheadas();
  } catch {
    return;
  }
  const elegida = instaladas.find((i) => i.nombre === destino);
  if (elegida !== undefined && !elegida.sirveParaTicket) {
    throw new ErrorImpresoraVirtual(destino);
  }
}

/**
 * La impresora a la que va a salir el ticket: la configurada, o la
 * predeterminada de Windows si no se eligió ninguna.
 */
export async function impresoraEfectiva(): Promise<string> {
  const elegida = nombreImpresoraConfigurada();
  if (elegida !== "") return elegida;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("impresora_predeterminada");
}

export class ImpresoraEscPos implements ImpresoraTermica {
  constructor(private readonly columnas = 32) {}

  async imprimirTicket(datos: DatosTicket): Promise<void> {
    await verificarDestino();
    const { invoke } = await import("@tauri-apps/api/core");
    const logo =
      datos.logoDataUrl !== undefined
        ? await logoARaster(datos.logoDataUrl, this.columnas * PUNTOS_POR_COLUMNA)
        : null;
    const bytes = construirEscPos(datos, this.columnas, logo ?? undefined);
    await invoke("imprimir_escpos", {
      impresora: nombreImpresoraConfigurada() || null,
      // El comando espera Vec<u8>; un Uint8Array no serializa a JSON.
      datos: Array.from(bytes),
    });
  }

  async abrirCajon(): Promise<void> {
    const { invoke } = await import("@tauri-apps/api/core");
    // ESC p 0 25 250: pulso al cajón conectado al puerto RJ11 de la impresora.
    await invoke("imprimir_escpos", {
      impresora: nombreImpresoraConfigurada() || null,
      datos: [0x1b, 0x70, 0x00, 0x19, 0xfa],
    });
  }

  async verificarEstado(): Promise<EstadoImpresora> {
    // El spooler no expone el estado de papel de la térmica por esta vía, así
    // que el sin_papel real aparece recién al imprimir. Lo que sí se puede
    // detectar acá —y es el caso que ya nos pasó— es que el ticket esté
    // saliendo a una impresora virtual: el trabajo "se imprime" bien y termina
    // en un archivo ilegible.
    try {
      const destino = await impresoraEfectiva();
      const instaladas = await listarImpresoras();
      const elegida = instaladas.find((i) => i.nombre === destino);
      if (elegida !== undefined && !elegida.sirveParaTicket) {
        return {
          ok: false,
          razon: "error",
          detalle: `El ticket está saliendo a "${destino}", que es una impresora virtual: guarda un archivo en vez de imprimir. Elegí la impresora térmica en Configuración > Impresora de tickets.`,
        };
      }
      return { ok: true };
    } catch {
      return { ok: false, razon: "sin_conexion" };
    }
  }
}
