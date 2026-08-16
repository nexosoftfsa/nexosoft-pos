/**
 * Hook compartido para capturar escaneos de un lector de código de barras:
 * se suscribe al puerto `LectorDeBarras` (mock o real) y, en paralelo, acumula
 * pulsaciones de teclado hasta `Enter` — los lectores HID inalámbricos/USB se
 * comportan como un teclado. Ignora el evento si el foco está en un `<input>`
 * (el usuario está tipeando). Extraído de `PantallaPos.tsx` para reusarlo en
 * cualquier pantalla que necesite escanear (ej. etiquetas de góndola).
 */
import { useEffect, useRef } from "react";

import type { LectorDeBarras } from "@nexosoft/hardware";

export function useLectorTeclado(
  lector: LectorDeBarras,
  onCodigo: (codigo: string) => void,
  activo = true,
): void {
  const buffer = useRef("");

  useEffect(() => {
    if (!activo) return;

    const unsub = lector.onEscaneo(onCodigo);

    function onKeyDown(e: KeyboardEvent) {
      if (document.activeElement?.tagName === "INPUT") return;
      if (e.key === "Enter") {
        const codigo = buffer.current.trim();
        buffer.current = "";
        if (codigo.length > 0) onCodigo(codigo);
      } else if (e.key.length === 1) {
        buffer.current += e.key;
      }
    }
    window.addEventListener("keydown", onKeyDown);

    return () => {
      unsub();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [lector, onCodigo, activo]);
}
