/**
 * Pantalla del Asistente de IA. Chat en lenguaje natural sobre el comercio.
 * Habla con un puerto `AsistenteIA` (mock funcional en la demo; Gemini real
 * cuando haya API key). Ver `sync/cliente-ia.ts`.
 */
import { useRef, useState } from "react";

import type { AsistenteIA } from "../sync/cliente-ia";

interface Mensaje {
  readonly rol: "usuario" | "asistente";
  readonly texto: string;
}

const SUGERENCIAS = [
  "¿Cuánto vendí hoy?",
  "¿Qué productos tengo por vencer?",
  "¿Qué stock está bajo?",
  "¿Quién me debe plata?",
];

const BIENVENIDA: Mensaje = {
  rol: "asistente",
  texto:
    "¡Hola! Soy tu asistente. Puedo darte un pulso rápido del negocio: ventas del día, " +
    "stock por reponer, vencimientos y cuentas por cobrar. Preguntame lo que quieras 👇",
};

export function AsistenteIA({ cliente }: { cliente: AsistenteIA }) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([BIENVENIDA]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);

  async function preguntar(pregunta: string) {
    const q = pregunta.trim();
    if (q === "" || pensando) return;
    setMensajes((m) => [...m, { rol: "usuario", texto: q }]);
    setTexto("");
    setPensando(true);
    try {
      const respuesta = await cliente.preguntar(q);
      setMensajes((m) => [...m, { rol: "asistente", texto: respuesta }]);
    } catch (e) {
      setMensajes((m) => [
        ...m,
        { rol: "asistente", texto: e instanceof Error ? e.message : String(e) },
      ]);
    } finally {
      setPensando(false);
      queueMicrotask(() => finRef.current?.scrollIntoView({ behavior: "smooth" }));
    }
  }

  return (
    <div className="gestion ia">
      <div className="card ia-chat">
        <div className="ia-mensajes">
          {mensajes.map((m, i) => (
            <div key={i} className={`ia-msg ia-msg--${m.rol}`}>
              {m.rol === "asistente" && <span className="ia-avatar">✨</span>}
              <div className="ia-burbuja">{m.texto}</div>
            </div>
          ))}
          {pensando && (
            <div className="ia-msg ia-msg--asistente">
              <span className="ia-avatar">✨</span>
              <div className="ia-burbuja ia-burbuja--pensando">Pensando…</div>
            </div>
          )}
          <div ref={finRef} />
        </div>

        <div className="ia-sugerencias">
          {SUGERENCIAS.map((s) => (
            <button key={s} type="button" className="pill-btn" onClick={() => void preguntar(s)} disabled={pensando}>
              {s}
            </button>
          ))}
        </div>

        <form
          className="ia-entrada"
          onSubmit={(e) => {
            e.preventDefault();
            void preguntar(texto);
          }}
        >
          <input
            className="input"
            placeholder="Escribí tu pregunta…"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <button type="submit" className="pill-btn pill-btn--primary" disabled={pensando || texto.trim() === ""}>
            Preguntar
          </button>
        </form>
      </div>
      <p className="muted ia-nota">
        Demo: el asistente responde con los datos de tu comercio. La versión con IA
        generativa (Google Gemini) se activa al configurar la clave de API.
      </p>
    </div>
  );
}
