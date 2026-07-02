/**
 * Shell de la aplicación (Fase 7.1): menú lateral + barra superior + área de
 * contenido. Reúne la identidad visual de la maqueta (`prototipo/`) y aloja los
 * módulos del POS. La pantalla de Ventas vive ahora DENTRO del shell; el resto
 * de los módulos son placeholders hasta sus sub-fases.
 *
 * Concentra acá lo que antes estaba en la barra de `PantallaPos`: indicador de
 * sincronización, datos del comercio, terminal y cierre de sesión. La cola de
 * sync se orquesta una sola vez (`useSync`) y se baja como prop a Ventas.
 */
import { useMemo, useState } from "react";

import type { EntornoPos } from "../datos/bootstrap";
import type { ClienteCatalogoAdmin } from "../sync/cliente-catalogo-admin";
import type { ClienteStock } from "../sync/cliente-stock";
import { IndicadorSync } from "../sync/IndicadorSync";
import { useSync } from "../sync/useSync";
import { PantallaPos } from "../componentes/PantallaPos";
import { CatalogoAbm } from "../componentes/CatalogoAbm";
import { StockAbm } from "../componentes/StockAbm";
import { IconoMenu, IconoSalir } from "./iconos";
import { Placeholder } from "./Placeholder";
import {
  buscarModulo,
  ETIQUETA_ROL,
  moduloInicial,
  modulosVisibles,
  normalizarRol,
  SECCIONES,
  type DefinicionModulo,
} from "./modulos";

export interface UsuarioShell {
  readonly email?: string;
  readonly rol?: string;
}

function iniciales(email: string | undefined): string {
  if (!email) return "NS";
  const local = email.split("@")[0] ?? email;
  const partes = local.split(/[.\-_]/).filter(Boolean);
  const dos = (partes.length >= 2 ? partes[0]![0]! + partes[1]![0]! : local.slice(0, 2));
  return dos.toUpperCase();
}

export function Shell({
  entorno,
  usuario,
  clienteCatalogo,
  clienteStock,
  terminalNombre,
  onCerrarSesion,
  onAbrirConfig,
}: {
  entorno: EntornoPos;
  usuario: UsuarioShell;
  /** Cliente del ABM de catálogo (HTTP en Tauri, simulado en el navegador). */
  clienteCatalogo?: ClienteCatalogoAdmin;
  /** Cliente de stock (HTTP en Tauri, simulado en el navegador). */
  clienteStock?: ClienteStock;
  terminalNombre?: string;
  onCerrarSesion?: () => void;
  onAbrirConfig?: () => void;
}) {
  const sync = useSync(entorno.sync);
  const visibles = useMemo(() => modulosVisibles(usuario.rol), [usuario.rol]);
  const [activoId, setActivoId] = useState<string>(() => moduloInicial(usuario.rol));
  const [navAbierto, setNavAbierto] = useState(false);

  const activo = visibles.find((m) => m.id === activoId) ?? visibles[0];

  function navegar(id: string) {
    setNavAbierto(false);
    const m = buscarModulo(id);
    // Configuración se resuelve fuera del shell (persiste y reinicializa).
    if (m?.externo && onAbrirConfig) {
      onAbrirConfig();
      return;
    }
    setActivoId(id);
  }

  const rolLegible = ETIQUETA_ROL[normalizarRol(usuario.rol)];

  return (
    <div className="app-shell">
      <aside className={`sidebar${navAbierto ? " sidebar--open" : ""}`}>
        <div className="sidebar__brand">
          <div className="logo">
            <div className="logo__mark">NS</div>
            <div className="logo__text">
              <span className="logo__name">
                NEXO<b>SOFT</b>
              </span>
              <span className="logo__tag">Conectamos tu negocio</span>
            </div>
          </div>
        </div>

        <nav className="nav">
          {SECCIONES.map((seccion) => {
            const items = visibles.filter((m) => m.seccion === seccion);
            if (items.length === 0) return null;
            return (
              <div key={seccion}>
                <div className="nav__sec">{seccion}</div>
                {items.map((m) => (
                  <ItemNav key={m.id} modulo={m} activo={m.id === activo?.id} onClick={() => navegar(m.id)} />
                ))}
              </div>
            );
          })}
        </nav>

        <div className="sidebar__user">
          <div className="avatar">{iniciales(usuario.email)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="u-name">{usuario.email ?? "Usuario"}</div>
            <div className="u-role">{rolLegible}</div>
          </div>
          {onCerrarSesion && (
            <button
              type="button"
              className="logout-btn"
              onClick={onCerrarSesion}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
            >
              <IconoSalir />
            </button>
          )}
        </div>
      </aside>

      {navAbierto && <div className="nav-backdrop nav-backdrop--show" onClick={() => setNavAbierto(false)} />}

      <div className="shell-main">
        <header className="topbar">
          <button type="button" className="hamburger" onClick={() => setNavAbierto(true)} aria-label="Menú">
            <IconoMenu />
          </button>
          <div>
            <h1>{activo?.titulo ?? "NexoSoft"}</h1>
            <div className="crumb">{activo?.crumb ?? ""}</div>
          </div>
          <div className="spacer" />
          <div className="topbar__status">
            <span className="chip chip--muted" title="Comercio">
              {entorno.config.razonSocial}
            </span>
            <IndicadorSync estado={sync} />
            {terminalNombre !== undefined && (
              <span className="chip chip--muted" title="Terminal">
                {terminalNombre}
              </span>
            )}
          </div>
        </header>

        <div className="shell-content">
          {activo?.id === "pos" ? (
            <PantallaPos entorno={entorno} sync={sync} />
          ) : activo?.id === "catalogo" && clienteCatalogo ? (
            <CatalogoAbm cliente={clienteCatalogo} />
          ) : activo?.id === "stock" && clienteStock ? (
            <StockAbm cliente={clienteStock} />
          ) : activo ? (
            <Placeholder modulo={activo} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ItemNav({
  modulo,
  activo,
  onClick,
}: {
  modulo: DefinicionModulo;
  activo: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`nav-item${activo ? " nav-item--active" : ""}`} onClick={onClick}>
      {modulo.icono()}
      {modulo.titulo}
      {modulo.badge !== undefined && <span className="badge badge--info">{modulo.badge}</span>}
    </button>
  );
}
