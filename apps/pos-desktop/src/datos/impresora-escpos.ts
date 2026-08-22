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
}

export class ImpresoraEscPos implements ImpresoraTermica {
  constructor(private readonly columnas = 32) {}

  async imprimirTicket(datos: DatosTicket): Promise<void> {
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
    // El spooler no expone el estado de papel de la térmica por esta vía; se
    // reporta OK si hay una impresora resoluble, y el fallo real aparece al
    // imprimir (con su mensaje).
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      if (nombreImpresoraConfigurada() === "") {
        await invoke<string>("impresora_predeterminada");
      }
      return { ok: true };
    } catch {
      return { ok: false, razon: "sin_conexion" };
    }
  }
}
