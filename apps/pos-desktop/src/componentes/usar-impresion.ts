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

/**
 * Fija el tamaño de página midiendo lo que se va a imprimir. Hace falta para
 * el rollo térmico: `size` no admite `<medida> auto`, así que sin un alto
 * explícito el navegador usa el papel del driver — en una térmica eso es un
 * rollo de metros y sale un ticket sin fin.
 *
 * La regla se inyecta como `@page` SIN NOMBRE, a propósito: las páginas con
 * nombre (`@page ticket-chico` + `page: ticket-chico`) dependen de soporte
 * del motor, y si no está, la regla entera se ignora en silencio y vuelve el
 * problema original. Como mientras se imprime solo hay un documento visible
 * (el resto queda en `visibility:hidden`), pisar la `@page` global es seguro;
 * el estilo se saca en `afterprint` para no afectar impresiones posteriores
 * (A4, etiquetas, credencial).
 */
export interface PaginaAMedida {
  /** Ancho imprimible del papel, en mm. */
  readonly anchoMm: number;
  /** Nodo a medir. */
  readonly selector: string;
  /** Papel extra al final para que el corte no coma la última línea. */
  readonly colaMm?: number;
}

const ID_ESTILO_PAGINA = "nexosoft-pagina-a-medida";
const PX_POR_MM = 96 / 25.4;

function ajustarAltoDePagina(o: PaginaAMedida): void {
  const nodo = document.querySelector<HTMLElement>(o.selector);
  if (!nodo) return;

  // En pantalla el nodo está `display:none` (solo aparece en @media print),
  // así que no tiene alto medible: se lo muestra fuera de la vista, al ancho
  // real del papel, se mide, y se restauran los estilos inline previos.
  const estiloPrevio = nodo.getAttribute("style");
  nodo.style.display = "block";
  nodo.style.position = "absolute";
  nodo.style.left = "-10000px";
  nodo.style.top = "0";
  nodo.style.width = `${o.anchoMm}mm`;
  const altoPx = nodo.getBoundingClientRect().height;
  if (estiloPrevio === null) nodo.removeAttribute("style");
  else nodo.setAttribute("style", estiloPrevio);

  if (altoPx <= 0) return; // no se pudo medir: queda el fallback del CSS
  const altoMm = Math.ceil(altoPx / PX_POR_MM) + (o.colaMm ?? 4);

  let estilo = document.getElementById(ID_ESTILO_PAGINA) as HTMLStyleElement | null;
  if (!estilo) {
    estilo = document.createElement("style");
    estilo.id = ID_ESTILO_PAGINA;
    document.head.appendChild(estilo);
  }
  estilo.textContent = `@page { size: ${o.anchoMm}mm ${altoMm}mm; margin: 0; }`;
}

function quitarPaginaAMedida(): void {
  document.getElementById(ID_ESTILO_PAGINA)?.remove();
}

export function useImpresion<T>(
  claseBody: string,
  pagina?: PaginaAMedida,
): {
  readonly datos: T | null;
  readonly imprimir: (datos: T) => void;
} {
  const [datos, setDatos] = useState<T | null>(null);

  const imprimir = useCallback(
    (d: T) => {
      flushSync(() => setDatos(d));
      document.body.classList.add(claseBody);
      // Después del flushSync el nodo ya está en el DOM con los datos reales,
      // así que recién acá se puede medir su alto.
      if (pagina) ajustarAltoDePagina(pagina);

      function limpiar() {
        document.body.classList.remove(claseBody);
        quitarPaginaAMedida();
        setDatos(null);
        window.removeEventListener("afterprint", limpiar);
      }
      window.addEventListener("afterprint", limpiar);

      window.print();
    },
    [claseBody, pagina],
  );

  return { datos, imprimir };
}
