/**
 * Los diálogos del navegador, esperados como corresponde.
 *
 * `window.confirm` y `window.prompt` son sincrónicos en un navegador y
 * devuelven el valor directo. **Dentro de Tauri no.** El webview los reemplaza
 * por versiones que devuelven una promesa, y un `if (!window.confirm(...))`
 * escrito para el navegador evalúa esa promesa —siempre verdadera— y sigue de
 * largo sin haber preguntado nada.
 *
 * Eso se vio en campo el 22/9/2026: F4 vaciaba la caja sin preguntar. Y lo
 * mismo estaba pasando, sin que nadie lo notara, en el botón "Descartar" de la
 * cola de sincronización, que saca operaciones de la cola para siempre.
 *
 * `await` sirve para los dos mundos: esperar un booleano devuelve el booleano,
 * y esperar una promesa devuelve su valor. Por eso estas funciones son `async`
 * aunque en un navegador no haga falta.
 */

/**
 * Se llega por `globalThis` y no por `window` para poder probarlo: en el
 * navegador son lo mismo, y en Node —donde corren los tests— `window` no
 * existe. La firma declarada es la del navegador; el `unknown` de la respuesta
 * es justamente el punto.
 */
const dialogos = globalThis as unknown as {
  confirm(mensaje: string): unknown;
  prompt(mensaje: string, valorInicial?: string): unknown;
};

/** Pregunta y espera la respuesta de verdad. Ante la duda, `false`. */
export async function preguntarSiNo(mensaje: string): Promise<boolean> {
  const respuesta: unknown = await Promise.resolve(dialogos.confirm(mensaje));
  return respuesta === true;
}

/**
 * Pide un texto y espera la respuesta de verdad. `null` si canceló.
 *
 * Devuelve `null` también cuando el entorno no da un texto: mejor no hacer
 * nada que interpretar un objeto como si fuera lo que tecleó el cajero.
 */
export async function pedirTexto(mensaje: string, valorInicial?: string): Promise<string | null> {
  const respuesta: unknown = await Promise.resolve(dialogos.prompt(mensaje, valorInicial));
  return typeof respuesta === "string" ? respuesta : null;
}
