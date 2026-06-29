/**
 * Pantalla provisoria para los módulos que todavía no se implementaron. Cada
 * sub-fase de la Fase 7 va reemplazando uno de estos por la pantalla real.
 */
import type { DefinicionModulo } from "./modulos";

export function Placeholder({ modulo }: { modulo: DefinicionModulo }) {
  return (
    <div className="placeholder">
      <div className="placeholder__ico">{modulo.icono()}</div>
      <h2 className="placeholder__titulo">{modulo.titulo}</h2>
      <p className="placeholder__texto">
        Este módulo se está construyendo en la Fase 7. Pronto vas a poder
        gestionarlo desde acá, con la misma información del servidor de sucursal.
      </p>
      <span className="badge badge--info">Próximamente</span>
    </div>
  );
}
