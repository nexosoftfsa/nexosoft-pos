/**
 * Pantalla del Asistente de IA. Chat en lenguaje natural sobre el comercio.
 * Habla con un puerto `AsistenteIA` (mock funcional en la demo; Gemini real
 * cuando el servidor tiene la clave cargada). Ver `sync/cliente-ia.ts`.
 *
 * ADR-0040: el ADMIN puede cargar/editar la clave de Gemini desde acá (sin
 * tocar archivos del servidor) si el entorno expone `clienteConfig`.
 */
import { useEffect, useRef, useState } from "react";

import type { AsistenteIA } from "../sync/cliente-ia";
import {
  ErrorAsistenteConfig,
  type ClienteAsistenteConfig,
  type EstadoConfiguracionAsistente,
} from "../sync/cliente-asistente-config";

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

function mensajeError(e: unknown): string {
  if (e instanceof ErrorAsistenteConfig) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}

export function AsistenteIA({
  cliente,
  clienteConfig,
  puedeConfigurar = false,
}: {
  cliente: AsistenteIA;
  /** Presente solo cuando el POS está conectado a un servidor real (no en modo demo). */
  clienteConfig?: ClienteAsistenteConfig;
  /** Solo ADMIN puede configurar la clave de Gemini. */
  puedeConfigurar?: boolean;
}) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([BIENVENIDA]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [modalConfig, setModalConfig] = useState(false);
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

  const mostrarConfig = puedeConfigurar && clienteConfig !== undefined;

  return (
    <div className="gestion ia">
      {mostrarConfig && (
        <div className="toolbar">
          <div className="spacer" />
          <button type="button" className="pill-btn" onClick={() => setModalConfig(true)}>
            ⚙ Configurar IA
          </button>
        </div>
      )}

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
        Las preguntas de datos (ventas, stock, vencimientos, deudores) siempre las responde el
        sistema. Para explicar funciones o temas fiscales, se conecta con Google Gemini si el
        servidor tiene la clave cargada.
      </p>

      {modalConfig && clienteConfig !== undefined && (
        <ModalConfigIA cliente={clienteConfig} onCerrar={() => setModalConfig(false)} />
      )}
    </div>
  );
}

function ModalConfigIA({
  cliente,
  onCerrar,
}: {
  cliente: ClienteAsistenteConfig;
  onCerrar: () => void;
}) {
  const [estado, setEstado] = useState<EstadoConfiguracionAsistente | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [modelo, setModelo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vivo = true;
    cliente
      .obtener()
      .then((e) => vivo && setEstado(e))
      .catch((e: unknown) => vivo && setError(mensajeError(e)));
    return () => {
      vivo = false;
    };
  }, [cliente]);

  async function guardar() {
    if (apiKey.trim().length < 10) {
      setError("Pegá una clave de API válida (la generás en https://aistudio.google.com/apikey).");
      return;
    }
    setGuardando(true);
    setError(null);
    setAviso(null);
    try {
      const r = await cliente.actualizar(apiKey.trim(), modelo.trim() === "" ? undefined : modelo.trim());
      setEstado(r);
      setApiKey("");
      setAviso("Clave guardada. Ya podés cerrar esta ventana y preguntarle al asistente.");
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="modal modal--show" onClick={onCerrar}>
      <div className="modal__box" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h3>Configurar Asistente IA</h3>
          <button type="button" className="modal__x" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className="modal__body">
          <p className="muted" style={{ marginTop: 0 }}>
            Estado actual:{" "}
            {estado === null ? (
              "cargando…"
            ) : estado.configurada ? (
              <span className="badge badge--ok">Configurada (modelo {estado.modelo})</span>
            ) : (
              <span className="badge badge--warn">Sin configurar</span>
            )}
          </p>
          <div className="field">
            <label>Clave de API de Gemini</label>
            <input
              className="input"
              type="password"
              placeholder="Pegá acá tu clave"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label>Modelo (opcional)</label>
            <input
              className="input"
              placeholder="gemini-2.5-flash"
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
            />
          </div>
          <p className="muted combo-ayuda">
            La clave se genera gratis en{" "}
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
              aistudio.google.com/apikey
            </a>{" "}
            con una cuenta de Google, y queda guardada solo en este servidor.
          </p>
          {error !== null && <div className="error">{error}</div>}
          {aviso !== null && <div className="aviso-ok">{aviso}</div>}
        </div>
        <div className="modal__foot">
          <button type="button" className="pill-btn" onClick={onCerrar} disabled={guardando}>
            Cerrar
          </button>
          <button type="button" className="pill-btn pill-btn--primary" onClick={() => void guardar()} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
