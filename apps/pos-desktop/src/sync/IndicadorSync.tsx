import { useState } from "react";

import type { EsperandoCae } from "./cliente-ventas";
import { confirmacionDescartar, estadoDeLaPildora } from "./indicador-sync-helpers";
import type { EstadoSync } from "./useSync";

/** Píldora de estado de sincronización para la barra superior. */
export function IndicadorSync({
  estado,
  esperandoCae,
  onSincronizacionManual,
}: {
  estado: EstadoSync;
  /**
   * Comprobantes subidos que todavía esperan el CAE. Es otro camino distinto al
   * de la cola: sin esto la píldora dice "Sincronizado" con ARCA caída.
   */
  esperandoCae?: EsperandoCae | null;
  /**
   * Qué más hacer cuando el botón lo aprieta una persona. Hoy: bajar el
   * catálogo del servidor.
   *
   * El botón dice "Sincronizar" y sólo subía la cola; el catálogo únicamente se
   * bajaba al arrancar el POS. Así, un producto corregido en el panel —un IVA,
   * un precio— no llegaba a la caja por más que se tocara el botón, y no había
   * ninguna forma de traerlo sin cerrar y volver a abrir el programa. Pasó con
   * un producto exento el 17/9/2026: el comprobante salió bien y el ticket
   * impreso siguió mostrando el IVA viejo.
   *
   * Sólo en el manual: la corrida automática cada 15 segundos no tiene por qué
   * pedir el catálogo entero.
   */
  onSincronizacionManual?: () => void;
}) {
  const {
    online,
    sincronizando,
    pendientes,
    fallidas,
    detalleFallidas,
    detalleTrabadas,
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

  /**
   * Lo que hace el botón cuando lo aprieta una persona: sube la cola y además
   * baja el catálogo. Que el catálogo falle no puede tapar que la cola subió.
   */
  async function sincronizarAMano() {
    await (fallidas > 0 ? reintentarFallidasYSincronizar() : sincronizarAhora());
    try {
      onSincronizacionManual?.();
    } catch (e) {
      console.error("No se pudo refrescar el catálogo al sincronizar:", e);
    }
  }

  const pildora = estadoDeLaPildora({
    online,
    sincronizando,
    pendientes,
    fallidas,
    ...(esperandoCae !== undefined ? { esperandoCae } : {}),
  });
  const texto = pildora.texto;

  /**
   * El botón está SIEMPRE que se pueda sincronizar, aunque no haya nada en la
   * cola.
   *
   * Antes se escondía con la cola vacía, que parecía razonable —"no hay nada
   * que subir"— hasta que el botón pasó a bajar también el catálogo: entonces
   * desaparecía exactamente en el caso normal, y no quedaba ninguna forma de
   * traer un producto corregido sin cerrar y volver a abrir el POS. Sebastián:
   * *"no tengo la opción de apretar Sincronizar, ya está en Sincronizado"*.
   */
  const mostrarBoton = online && !sincronizando;
  /** Hay algo que explicar: rechazadas, o pendientes que no están entrando. */
  const hayMotivoQueVer = fallidas > 0 || detalleTrabadas.length > 0;

  return (
    <>
      <div className={`sync sync-${pildora.tono}`} title={pildora.detalle}>
        <span className="sync-dot" aria-hidden />
        {hayMotivoQueVer ? (
          // Con ventas rechazadas el texto se vuelve un botón: el contador solo
          // no dice nada, y el motivo es lo único que permite arreglarlo.
          //
          // También con las TRABADAS —pendientes que ya fallaron alguna vez—,
          // que antes no ofrecían nada: se quedaban en "N ventas sin subir" sin
          // forma de saber por qué. Sebastián arrastró dos así tres pruebas.
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
          <button className="sync-boton" onClick={() => void sincronizarAMano()}>
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
              <strong>todavía no se registraron en el servidor</strong>, así que no figuran en el
              panel de reportes. Abajo está el motivo de cada una.
            </p>
            {detalleFallidas.length > 0 && <h3 className="sync-detalle-subtitulo">Rechazadas</h3>}
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

            {/* Las trabadas van aparte y con su propia explicación: se siguen
                reintentando solas, así que "Reintentar todas" no es lo que
                hace falta y decir lo contrario manda a tocar el botón
                equivocado. */}
            {detalleTrabadas.length > 0 && (
              <>
                <h3 className="sync-detalle-subtitulo">Siguen intentando</h3>
                <p className="sync-detalle-ayuda">
                  Estas <strong>se reintentan solas</strong> y no hace falta hacer nada. Si alguna
                  lleva mucho rato acá, el motivo de abajo dice por qué no entra.
                </p>
                <ul className="sync-detalle-lista">
                  {detalleTrabadas.map((op) => (
                    <li key={op.operacionId}>
                      <div className="sync-detalle-op">
                        {op.tipo} · {op.operacionId.slice(0, 8)} · {op.intentos} intento
                        {op.intentos === 1 ? "" : "s"}
                      </div>
                      <div className="sync-detalle-error">{op.ultimoError ?? "sin detalle"}</div>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="sync-detalle-acciones">
              <button
                className="primario"
                onClick={() =>
                  void reintentarFallidasYSincronizar().then(() => setVerDetalle(false))
                }
              >
                {detalleFallidas.length > 0 ? "Reintentar todas" : "Sincronizar ahora"}
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
