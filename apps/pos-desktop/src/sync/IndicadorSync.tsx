import type { EstadoSync } from "./useSync";

/** Píldora de estado de sincronización para la barra superior. */
export function IndicadorSync({ estado }: { estado: EstadoSync }) {
  const { online, sincronizando, pendientes, fallidas, sincronizarAhora } = estado;

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
    <div className={`sync ${clase}`} title="Estado de sincronización con el servidor">
      <span className="sync-dot" aria-hidden />
      <span className="sync-texto">{texto}</span>
      {mostrarBoton && (
        <button className="sync-boton" onClick={() => void sincronizarAhora()}>
          Sincronizar
        </button>
      )}
    </div>
  );
}
