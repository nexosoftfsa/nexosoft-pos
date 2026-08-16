/**
 * Hook genérico de impresión "ocultar todo salvo el nodo a imprimir" (Fase
 * 10.4/10.5): `flushSync` fuerza el render antes de `window.print()` —a
 * diferencia de `requestAnimationFrame`, no depende de que la ventana esté
 * compositando frames (una pestaña oculta puede no llegar a ejecutar el rAF).
 * Cada consumidor usa su propia clase en `<body>` para no pisarse entre sí
 * (ver `estilos.css`, reglas `body.modo-impresion-*`).
 *
 * El cleanup (sacar la clase, limpiar `datos`) se hace en el evento
 * `afterprint`, NO justo después de `window.print()`: `window.print()` NO
 * está garantizado que bloquee hasta que se cierre el diálogo — es el
 * comportamiento habitual en la mayoría de los navegadores, pero MDN lo marca
 * explícitamente como no estandarizado. Con impresoras/drivers reales
 * (WebView2 en la PC del cliente) puede devolver el control antes de que el
 * SO termine de armar el diálogo/vista previa; si el cleanup corre ahí, el
 * contenido a imprimir ya está oculto (`visibility:hidden`) cuando se genera
 * la vista previa real, y lo único que queda visible son restos sueltos del
 * layout — sintomáticamente "un par de letras y una línea" en vez del
 * comprobante. `afterprint` sí está garantizado por el estándar.
 */
import { useCallback, useState } from "react";
import { flushSync } from "react-dom";

export function useImpresion<T>(claseBody: string): {
  readonly datos: T | null;
  readonly imprimir: (datos: T) => void;
} {
  const [datos, setDatos] = useState<T | null>(null);

  const imprimir = useCallback(
    (d: T) => {
      flushSync(() => setDatos(d));
      document.body.classList.add(claseBody);

      function limpiar() {
        document.body.classList.remove(claseBody);
        setDatos(null);
        window.removeEventListener("afterprint", limpiar);
      }
      window.addEventListener("afterprint", limpiar);

      window.print();
    },
    [claseBody],
  );

  return { datos, imprimir };
}
