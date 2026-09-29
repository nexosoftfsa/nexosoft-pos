/**
 * Preguntarle algo al cajero y esperar la respuesta de verdad.
 *
 * ## Por qué no usamos `window.confirm`
 *
 * En un navegador `confirm`/`prompt` son sincrónicos y devuelven el valor.
 * **Dentro de Tauri no.** El webview los reemplaza, y el reemplazo no se portó
 * igual en dos rondas de pruebas seguidas:
 *
 *  - 22/9/2026: devolvía una promesa. Un `if (!window.confirm(...))` escrito
 *    para el navegador evaluaba la promesa —siempre verdadera— y seguía de
 *    largo: F4 vaciaba la caja **sin preguntar nada**.
 *  - 26/9/2026: ya esperando esa promesa, F4 dejó de hacer absolutamente nada.
 *    No aparecía ningún cartel y la respuesta no era `true`. *"Aprieto y no
 *    sale nada."*
 *
 * Dos rondas para el mismo botón. La conclusión es que el diálogo del webview
 * no es algo sobre lo que se pueda construir: no lo controlamos, no se puede
 * probar acá y cambia entre versiones de Tauri y de WebView2. Así que el
 * diálogo lo dibujamos nosotros — ver `componentes/Dialogos.tsx`, que se monta
 * una vez en la raíz de la app y se registra acá.
 *
 * Este módulo queda como el punto de entrada de siempre (`preguntarSiNo`,
 * `pedirTexto`) para no tocar los veinte lugares que preguntan.
 */

/** Qué se le está preguntando al cajero. */
export interface PedidoDialogo {
  readonly tipo: "confirmar" | "texto";
  readonly mensaje: string;
  /** Sólo para `texto`: lo que viene cargado en el campo. */
  readonly valorInicial?: string;
}

/**
 * Quién dibuja el diálogo. Devuelve `true`/`false` para una confirmación, y el
 * texto o `null` para un pedido de texto.
 */
export type AtenderDialogo = (pedido: PedidoDialogo) => Promise<boolean | string | null>;

let atender: AtenderDialogo | null = null;
let abiertos = 0;

/** Lo llama `Dialogos.tsx` al montarse (y con `null` al desmontarse). */
export function registrarDialogos(fn: AtenderDialogo | null): void {
  atender = fn;
}

/**
 * ¿Hay un diálogo nuestro en pantalla?
 *
 * Lo consultan los listeners globales de teclado: mientras se pregunta algo, el
 * Enter y el Escape son del diálogo. Sin esto, el Esc que cancela la pregunta
 * cerraría además el panel que hay detrás.
 */
export function hayDialogoAbierto(): boolean {
  return abiertos > 0;
}

/**
 * Los diálogos del navegador, por si `Dialogos.tsx` no está montado (el modo
 * navegador de desarrollo y los tests). Se llega por `globalThis` y no por
 * `window` para poder probarlo: en Node —donde corren los tests— `window` no
 * existe. El `unknown` de la respuesta es justamente el punto.
 */
const nativos = globalThis as unknown as {
  confirm(mensaje: string): unknown;
  prompt(mensaje: string, valorInicial?: string): unknown;
};

async function preguntar(pedido: PedidoDialogo): Promise<unknown> {
  if (atender === null) {
    return pedido.tipo === "confirmar"
      ? Promise.resolve(nativos.confirm(pedido.mensaje))
      : Promise.resolve(nativos.prompt(pedido.mensaje, pedido.valorInicial));
  }
  abiertos++;
  try {
    return await atender(pedido);
  } finally {
    abiertos--;
  }
}

/** Pregunta sí o no. Ante la duda, `false`: no se hace nada. */
export async function preguntarSiNo(mensaje: string): Promise<boolean> {
  return (await preguntar({ tipo: "confirmar", mensaje })) === true;
}

/**
 * Pide un texto. `null` si canceló.
 *
 * Devuelve `null` también cuando el entorno no da un texto: mejor no hacer nada
 * que interpretar un objeto como si fuera lo que tecleó el cajero.
 */
export async function pedirTexto(mensaje: string, valorInicial?: string): Promise<string | null> {
  const respuesta = await preguntar({
    tipo: "texto",
    mensaje,
    ...(valorInicial !== undefined ? { valorInicial } : {}),
  });
  return typeof respuesta === "string" ? respuesta : null;
}
