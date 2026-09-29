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
    setActual(null);
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
