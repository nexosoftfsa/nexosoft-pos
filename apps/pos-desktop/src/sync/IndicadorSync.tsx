import { useState } from "react";

import { confirmacionDescartar } from "./indicador-sync-helpers";
import type { EstadoSync } from "./useSync";

/** Píldora de estado de sincronización para la barra superior. */
export function IndicadorSync({ estado }: { estado: EstadoSync }) {
  const {
    online,
    sincronizando,
    pendientes,
    fallidas,
    detalleFallidas,
    sincronizarAhora,
    reintentarFallidasYSincronizar,
    descartarFallidas,
  } = estado;
  const [verDetalle, setVerDetalle] = useState(false);
  const [descartando, setDescartando] = useState(false);

  /**
   * Saca de la cola lo que no puede entrar nunca. Se pregunta antes, y la
   * pregunta dice explícitamente que NO se borra ninguna venta: es lo primero
   * que se malinterpreta.
   */
  async function descartar() {
    if (!window.confirm(confirmacionDescartar(detalleFallidas))) return;
    setDescartando(true);
    try {
      await descartarFallidas();
      setVerDetalle(false);
    } finally {
      setDescartando(false);
    }
  }

  let clase = "sync-ok";
  let texto = "Sincronizado";
  if (!online) {
    clase = "sync-offline";
    texto = "Sin conexión";
  } else if (sincronizando) {
    clase = "sync-trabajando";
    texto = "Sincronizando…";
  } else if (fallidas > 0) {
    clase = "sync-error";
    texto = `${fallidas} con error`;
  } else if (pendientes > 0) {
    clase = "sync-pendiente";
    texto = `${pendientes} pendiente${pendientes > 1 ? "s" : ""}`;
  }

  const mostrarBoton = online && !sincronizando && (pendientes > 0 || fallidas > 0);

  return (
    <>
      <div className={`sync ${clase}`} title="Estado de sincronización con el servidor">
        <span className="sync-dot" aria-hidden />
        {fallidas > 0 ? (
          // Con ventas rechazadas el texto se vuelve un botón: el contador solo
          // no dice nada, y el motivo es lo único que permite arreglarlo.
          <button
            type="button"
            className="sync-texto sync-texto--boton"
            onClick={() => setVerDetalle(true)}
            title="Ver por qué no se sincronizaron"
          >
            {texto} — ver motivo
          </button>
        ) : (
          <span className="sync-texto">{texto}</span>
        )}
        {mostrarBoton && (
          <button
            className="sync-boton"
            onClick={() =>
              void (fallidas > 0 ? reintentarFallidasYSincronizar() : sincronizarAhora())
            }
          >
            {fallidas > 0 ? "Reintentar" : "Sincronizar"}
          </button>
        )}
      </div>

      {verDetalle && (
        <div className="overlay" onClick={() => setVerDetalle(false)}>
          <div className="sync-detalle" onClick={(e) => e.stopPropagation()}>
            <h3>Ventas que no llegaron al servidor</h3>
            {/*
              Decía "el servidor las rechazó", pero la causa más común es
              justamente la contraria: el pedido nunca llegó (servidor apagado,
              sin red). Culpar al servidor mandaba a buscar el problema en el
              lugar equivocado. El motivo puntual de cada una va abajo.
            */}
            <p className="sync-detalle-ayuda">
              Estas ventas están guardadas en esta terminal y el ticket salió, pero{" "}
              <strong>no se pudieron registrar en el servidor</strong>, así que no figuran en el
              panel de reportes. Abajo está el motivo de cada una.
            </p>
            <ul className="sync-detalle-lista">
              {detalleFallidas.map((op) => (
                <li key={op.operacionId}>
                  <div className="sync-detalle-op">
                    {op.tipo} · {op.operacionId.slice(0, 8)} · {op.intentos} intento
                    {op.intentos === 1 ? "" : "s"}
                  </div>
                  <div className="sync-detalle-error">{op.ultimoError ?? "sin detalle"}</div>
                </li>
              ))}
            </ul>
            <div className="sync-detalle-acciones">
              <button
                className="primario"
                onClick={() =>
                  void reintentarFallidasYSincronizar().then(() => setVerDetalle(false))
                }
              >
                Reintentar todas
              </button>
              {/*
                Para las que no pueden entrar nunca (apuntan a datos que el
                servidor ya no tiene). Mientras siguen acá el aviso queda
                encendido para siempre y tapa cualquier falla nueva.
              */}
              <button
                className="linkbtn linkbtn--danger"
                onClick={() => void descartar()}
                disabled={descartando}
              >
                {descartando ? "Descartando…" : "Descartar"}
              </button>
              <button onClick={() => setVerDetalle(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
