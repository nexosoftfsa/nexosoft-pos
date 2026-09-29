/**
 * El diálogo de confirmación de la app. Se monta UNA vez en la raíz y atiende
 * todo lo que pregunten `preguntarSiNo` / `pedirTexto` (ver `dialogos.ts`, que
 * explica por qué no usamos el del webview).
 *
 * Se opera con el teclado, como el resto de la caja: Enter acepta, Esc
 * cancela. El foco arranca en el campo de texto —o en Cancelar, cuando es una
 * confirmación— para que un Enter distraído no dispare lo que se está
 * preguntando.
 */
import { useEffect, useRef, useState } from "react";

import { registrarDialogos, type PedidoDialogo } from "../dialogos";

interface EnPantalla {
  readonly pedido: PedidoDialogo;
  readonly responder: (respuesta: boolean | string | null) => void;
}

export function Dialogos() {
  const [actual, setActual] = useState<EnPantalla | null>(null);
  const [texto, setTexto] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cancelarRef = useRef<HTMLButtonElement | null>(null);
  /**
   * Dónde estaba el foco antes de preguntar, para devolverlo al cerrar.
   *
   * Sin esto, cancelar un F4 dejaba el foco en el botón que se acababa de
   * desmontar: la caja quedaba sin recibir el teclado y había que volver al
   * buscador con el mouse, en una pantalla que se opera entera con el teclado.
   * Lo marcó Sebastián el 29/9/2026. Se resuelve acá y no en cada llamador
   * porque son doce los que preguntan.
   */
  const focoPrevioRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    registrarDialogos(
      (pedido) =>
        new Promise((resolve) => {
          setTexto(pedido.valorInicial ?? "");
          setActual({ pedido, responder: resolve });
        }),
    );
    return () => registrarDialogos(null);
  }, []);

  useEffect(() => {
    if (actual === null) return;
    // Se anota ANTES de mover el foco: montar el diálogo no se lo saca a nadie,
    // así que acá `activeElement` todavía es quien lo tenía.
    const previo = document.activeElement;
    focoPrevioRef.current = previo instanceof HTMLElement ? previo : null;

    if (actual.pedido.tipo === "texto") {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else {
      cancelarRef.current?.focus();
    }
  }, [actual]);

  if (actual === null) return null;

  const { pedido, responder } = actual;
  const esTexto = pedido.tipo === "texto";

  function cerrar(respuesta: boolean | string | null) {
    const volverA = focoPrevioRef.current;
    focoPrevioRef.current = null;
    setActual(null);
    // El foco se devuelve ANTES de resolver la promesa, a propósito: el que
    // preguntó puede querer mandarlo a otro lado —la caja siempre lo manda al
    // buscador— y lo último que se haga tiene que ser lo que gana. Devolverlo
    // después, en un `requestAnimationFrame`, pisaba esa decisión.
    if (volverA !== null && volverA.isConnected) volverA.focus();
    responder(respuesta);
  }

  return (
    <div
      className="overlay overlay-dialogo"
      onKeyDown={(e) => {
        // Se corta acá: mientras se pregunta algo, el Enter y el Escape son de
        // esta ventana y no del panel que quedó atrás.
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          cerrar(esTexto ? null : false);
        } else if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          cerrar(esTexto ? texto : true);
        }
      }}
    >
      <div className="dialogo" role="alertdialog" aria-modal="true">
        {/* El mensaje viene con saltos de línea a propósito (el aviso de F4
            separa qué se pierde de la pregunta). `pre-wrap` los respeta. */}
        <div className="dialogo-mensaje">{pedido.mensaje}</div>
        {esTexto && (
          <input
            ref={inputRef}
            className="dialogo-campo"
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
        )}
        <div className="dialogo-acciones">
          <button ref={cancelarRef} onClick={() => cerrar(esTexto ? null : false)}>
            Cancelar <kbd>Esc</kbd>
          </button>
          <button className="primario" onClick={() => cerrar(esTexto ? texto : true)}>
            {esTexto ? "Aceptar" : "Sí"} <kbd>Enter</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
