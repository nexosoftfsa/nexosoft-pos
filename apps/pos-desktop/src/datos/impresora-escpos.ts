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
import { construirEscPos, type DatosTicket, type EstadoImpresora, type ImpresoraTermica } from "@nexosoft/hardware";

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
    const bytes = construirEscPos(datos, this.columnas);
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
