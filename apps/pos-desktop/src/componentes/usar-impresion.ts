/**
 * Hook genérico de impresión "ocultar todo salvo el nodo a imprimir" (Fase
 * 10.4/10.5): `flushSync` fuerza el render antes de `window.print()` —a
 * diferencia de `requestAnimationFrame`, no depende de que la ventana esté
 * compositando frames (una pestaña oculta puede no llegar a ejecutar el rAF).
 * Cada consumidor usa su propia clase en `<body>` para no pisarse entre sí
 * (ver `estilos.css`, reglas `body.modo-impresion-*`).
 *
 * ## Cuándo se limpia, y por qué tardó dos intentos en quedar bien
 *
 * El cleanup (sacar la clase, limpiar `datos`) **no** se hace justo después de
 * `window.print()`: no está garantizado que bloquee hasta que se cierre el
 * diálogo — es lo habitual en la mayoría de los navegadores, pero MDN lo marca
 * explícitamente como no estandarizado. Con drivers reales (WebView2 en la PC
 * del cliente) devuelve el control antes de que el SO termine de armar la
 * vista previa, y si el cleanup corre ahí el contenido ya está oculto cuando
 * se genera: salían "un par de letras y una línea" en vez del comprobante.
 *
 * Se movió entonces a `afterprint`, que sí es estándar. **Y seguía siendo
 * demasiado temprano.** `afterprint` se dispara cuando se cierra la vista
 * previa, no cuando el trabajo de impresión terminó: entre una cosa y la otra
 * está todo el guardado del PDF o el spool a la impresora, que siguen leyendo
 * el documento. Al limpiar ahí le sacábamos el DOM de abajo al motor mientras
 * lo usaba. El 12/10/2026, exportando una reimpresión a PDF, eso terminó en un
 * **"Microsoft Edge WebView2 no responde"** con el "Guardar como" colgado.
 *
 * Ahora la limpieza queda **pendiente** y corre en el primero de dos momentos,
 * los dos posteriores al trabajo con certeza:
 *
 * 1. Al empezar la impresión siguiente — si hay otra, la anterior terminó.
 * 2. Pasado un rato largo desde `afterprint`, como higiene, para que una
 *    instalación que imprime una sola vez no quede en modo impresión.
 *
 * Dejarla montada mientras tanto no se ve: las hojas están `display:none` en
 * pantalla y sólo aparecen bajo `@media print`.
 */
import { useCallback, useState } from "react";
import { flushSync } from "react-dom";

import {
  arrancarPlazoDeGracia,
  dejarLimpiezaPendiente,
  saldarLimpieza,
} from "./limpieza-de-impresion";

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

/**
 * Inyecta una regla `@page` tal cual, para el documento que se va a imprimir.
 * Usa el mismo estilo (y el mismo `id`) que la página a medida, así que se
 * limpia con la misma función y las dos no pueden convivir.
 */
function inyectarReglaDePagina(regla: string): void {
  let estilo = document.getElementById(ID_ESTILO_PAGINA) as HTMLStyleElement | null;
  if (!estilo) {
    estilo = document.createElement("style");
    estilo.id = ID_ESTILO_PAGINA;
    document.head.appendChild(estilo);
  }
  estilo.textContent = regla;
}

/**
 * Imprime la pantalla tal como está, para los módulos que no tienen una hoja
 * propia (Presupuestos, Remitos).
 *
 * Saldar antes la limpieza pendiente es lo que evita que hereden el margen
 * cero de un A4 impreso un rato antes: esa regla `@page` queda puesta hasta la
 * impresión siguiente o hasta que venza el plazo de gracia, y estas pantallas
 * quedarían con el contenido pegado al borde de la hoja.
 */
export function imprimirPaginaActual(): void {
  saldarLimpieza();
  window.print();
}

export function useImpresion<T>(
  claseBody: string,
  pagina?: PaginaAMedida,
  /**
   * Regla `@page` propia de este documento. La usa el A4 para poner el margen
   * en cero: con el margen global de 15mm, Chromium escribe ahí la fecha de
   * impresión, el título de la ventana y `tauri.localhost`, que terminaban en
   * el PDF de un comprobante fiscal. La hoja se hace cargo de su propio
   * margen con `padding` (ver `.hoja-a4` en `estilos.css`).
   *
   * Va por documento y no en el `@page` global porque ese lo comparten
   * Presupuestos y Remitos, que imprimen directo y conservan su margen.
   */
  reglaDePagina?: string,
): {
  readonly datos: T | null;
  readonly imprimir: (datos: T) => void;
} {
  const [datos, setDatos] = useState<T | null>(null);

  const imprimir = useCallback(
    (d: T) => {
      // Que haya una impresión nueva es la única señal confiable de que la
      // anterior terminó: recién acá se puede desarmar lo que quedó montado.
      saldarLimpieza();

      flushSync(() => setDatos(d));
      document.body.classList.add(claseBody);
      // Después del flushSync el nodo ya está en el DOM con los datos reales,
      // así que recién acá se puede medir su alto.
      if (pagina) ajustarAltoDePagina(pagina);
      else if (reglaDePagina !== undefined) inyectarReglaDePagina(reglaDePagina);

      function limpiar() {
        window.removeEventListener("afterprint", alCerrarLaVistaPrevia);
        document.body.classList.remove(claseBody);
        quitarPaginaAMedida();
        setDatos(null);
      }

      // Cerrar la vista previa NO quiere decir que el trabajo terminó: falta
      // guardar el PDF o mandarlo a la cola, y para eso se sigue leyendo este
      // documento. Lo único que se hace acá es arrancar el plazo de gracia.
      function alCerrarLaVistaPrevia() {
        window.removeEventListener("afterprint", alCerrarLaVistaPrevia);
        arrancarPlazoDeGracia();
      }

      dejarLimpiezaPendiente(limpiar);
      window.addEventListener("afterprint", alCerrarLaVistaPrevia);

      window.print();
    },
    [claseBody, pagina, reglaDePagina],
  );

  return { datos, imprimir };
}
