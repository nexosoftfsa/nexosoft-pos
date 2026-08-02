/**
 * Hook genérico de impresión "ocultar todo salvo el nodo a imprimir" (Fase
 * 10.4/10.5): `flushSync` fuerza el render antes de `window.print()` —a
 * diferencia de `requestAnimationFrame`, no depende de que la ventana esté
 * compositando frames (una pestaña oculta puede no llegar a ejecutar el rAF).
 * Cada consumidor usa su propia clase en `<body>` para no pisarse entre sí
 * (ver `estilos.css`, reglas `body.modo-impresion-*`).
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
      window.print();
      document.body.classList.remove(claseBody);
      setDatos(null);
    },
    [claseBody],
  );

  return { datos, imprimir };
}
