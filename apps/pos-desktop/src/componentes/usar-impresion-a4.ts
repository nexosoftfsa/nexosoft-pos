/**
 * Fase 10.4: hook chico para imprimir un comprobante en A4. Comparte el mismo
 * `DatosTicket` de la impresora térmica; renderiza `<ComprobanteA4>` oculto y
 * lo revela solo durante `window.print()` (clase `modo-impresion-a4` en
 * `<body>`, ver `estilos.css`).
 */
import { useCallback, useState } from "react";
import { flushSync } from "react-dom";
import type { DatosTicket } from "@nexosoft/hardware";

export function useImpresionA4(): {
  readonly datosA4: DatosTicket | null;
  readonly imprimirA4: (datos: DatosTicket) => void;
} {
  const [datosA4, setDatosA4] = useState<DatosTicket | null>(null);

  const imprimirA4 = useCallback((datos: DatosTicket) => {
    // flushSync fuerza el render de `.hoja-a4` ANTES de imprimir — a
    // diferencia de requestAnimationFrame, no depende de que la ventana esté
    // pintando frames (una pestaña minimizada/oculta puede no llegar nunca a
    // ejecutar el rAF, dejando el print() sin datos).
    flushSync(() => setDatosA4(datos));
    document.body.classList.add("modo-impresion-a4");
    window.print();
    document.body.classList.remove("modo-impresion-a4");
    setDatosA4(null);
  }, []);

  return { datosA4, imprimirA4 };
}
