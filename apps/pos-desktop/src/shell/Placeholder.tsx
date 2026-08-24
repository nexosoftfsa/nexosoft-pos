/**
 * Pantalla para un módulo que no se puede mostrar en este contexto.
 *
 * Decía "se está construyendo en la Fase 7 — Próximamente", que era cierto
 * cuando se escribió y hoy es mentira: están todos implementados. Lo que
 * queda es que a un módulo le falte con qué hablar — el modo demo no tiene
 * servidor, y sin servidor no hay usuarios que administrar ni configuración
 * de sucursal que tocar. Decir eso es útil; decir "próximamente" hace pensar
 * que el sistema está a medio hacer.
 */
import type { DefinicionModulo } from "./modulos";

export function Placeholder({
  modulo,
  motivo,
}: {
  modulo: DefinicionModulo;
  motivo?: string | undefined;
}) {
  return (
    <div className="placeholder">
      <div className="placeholder__ico">{modulo.icono()}</div>
      <h2 className="placeholder__titulo">{modulo.titulo}</h2>
      <p className="placeholder__texto">
        {motivo ??
          "Este módulo trabaja contra el servidor de sucursal y ahora mismo no hay conexión con él. Revisá que el servidor esté encendido y volvé a entrar."}
      </p>
    </div>
  );
}
