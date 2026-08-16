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
import { useEffect, useMemo, useState } from "react";

import type { EntornoPos } from "../datos/bootstrap";
import type { ClienteCatalogoAdmin } from "../sync/cliente-catalogo-admin";
import type { ClienteStock } from "../sync/cliente-stock";
import type { ClienteCaja } from "../sync/cliente-caja";
import type { ClienteCtaCte } from "../sync/cliente-ctacte";
import type { ClienteVentas } from "../sync/cliente-ventas";
import type { ClienteReportes } from "../sync/cliente-reportes";
import type { ClientePresupuestos } from "../sync/cliente-presupuestos";
import type { ClienteRemitos } from "../sync/cliente-remitos";
import type { ClienteProveedores } from "../sync/cliente-proveedores";
import type { ClienteMediosPago } from "../sync/cliente-medios-pago";
import { IndicadorSync } from "../sync/IndicadorSync";
import { useSync } from "../sync/useSync";
import { PantallaPos } from "../componentes/PantallaPos";
import { CatalogoAbm } from "../componentes/CatalogoAbm";
import { StockAbm } from "../componentes/StockAbm";
import { CajaPanel } from "../componentes/CajaPanel";
import { CuentasCorrientes } from "../componentes/CuentasCorrientes";
import { Comprobantes } from "../componentes/Comprobantes";
import { EtiquetasGondola } from "../componentes/EtiquetasGondola";
import { ReportesPos } from "../componentes/ReportesPos";
import { Presupuestos } from "../componentes/Presupuestos";
import { Remitos } from "../componentes/Remitos";
import { Proveedores } from "../componentes/Proveedores";
import { MediosDePago } from "../componentes/MediosDePago";
import { Inicio } from "../componentes/Inicio";
import { AsistenteIA as PantallaAsistenteIA } from "../componentes/AsistenteIA";
import { AsistenteIACompuesto, AsistenteIAMock, type AsistenteIA } from "../sync/cliente-ia";
import type { ClienteAsistenteConfig } from "../sync/cliente-asistente-config";
import { Usuarios as PantallaUsuarios } from "../componentes/Usuarios";
import type { ClienteUsuarios } from "../sync/cliente-usuarios-http";
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
  readonly id?: string;
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
  clienteCaja,
  clienteCtaCte,
  clienteVentas,
  clienteReportes,
  clientePresupuestos,
  clienteRemitos,
  clienteProveedores,
  clienteMediosPago,
  clienteIA,
  clienteAsistenteConfig,
  clienteUsuarios,
  terminalId,
  terminalNombre,
  onCerrarSesion,
  tituloCerrarSesion = "Cerrar sesión",
  onAbrirConfig,
}: {
  entorno: EntornoPos;
  usuario: UsuarioShell;
  /** Cliente del ABM de catálogo (HTTP en Tauri, simulado en el navegador). */
  clienteCatalogo?: ClienteCatalogoAdmin;
  /** Cliente de stock (HTTP en Tauri, simulado en el navegador). */
  clienteStock?: ClienteStock;
  /** Cliente de caja (HTTP en Tauri, simulado en el navegador). */
  clienteCaja?: ClienteCaja;
  /** Cliente de cuentas corrientes (HTTP en Tauri, simulado en el navegador). */
  clienteCtaCte?: ClienteCtaCte;
  /** Cliente de comprobantes/ventas (HTTP en Tauri, simulado en el navegador). */
  clienteVentas?: ClienteVentas;
  /** Cliente de reportes (HTTP en Tauri, simulado en el navegador). */
  clienteReportes?: ClienteReportes;
  /** Cliente de presupuestos (HTTP en Tauri, simulado en el navegador). */
  clientePresupuestos?: ClientePresupuestos;
  /** Cliente de remitos (HTTP en Tauri, simulado en el navegador). */
  clienteRemitos?: ClienteRemitos;
  /** Cliente de proveedores (HTTP en Tauri, simulado en el navegador). */
  clienteProveedores?: ClienteProveedores;
  /** Cliente de medios de pago (HTTP en Tauri, simulado en el navegador). */
  clienteMediosPago?: ClienteMediosPago;
  /** Asistente con LLM real (Gemini vía el servidor). Sin esto, solo responde con datos. */
  clienteIA?: AsistenteIA;
  /** Config del asistente (cargar/editar la clave de Gemini). Solo ADMIN, solo Tauri conectado. */
  clienteAsistenteConfig?: ClienteAsistenteConfig;
  /** Gestión de usuarios (alta, rol, activo). Solo ADMIN, solo Tauri conectado. */
  clienteUsuarios?: ClienteUsuarios;
  /** Id de la terminal (para la caja). */
  terminalId?: string;
  terminalNombre?: string;
  onCerrarSesion?: () => void;
  /** Texto del botón/tooltip de `onCerrarSesion` (p.ej. "Salir del modo demo"). */
  tituloCerrarSesion?: string;
  onAbrirConfig?: () => void;
}) {
  const sync = useSync(entorno.sync);
  const visibles = useMemo(() => modulosVisibles(usuario.rol), [usuario.rol]);
  const catalogoPresup = useMemo(
    () =>
      entorno.catalogo.map((c) => ({
        id: c.articulo.id,
        descripcion: c.articulo.descripcion,
        precio: c.precioFinal.aDecimalString(2),
      })),
    [entorno.catalogo],
  );
  const [activoId, setActivoId] = useState<string>(() => moduloInicial(usuario.rol));
  const [navAbierto, setNavAbierto] = useState(false);

  // Clientes para vender en cuenta corriente (fiado) desde la pantalla de ventas.
  const [clientesVenta, setClientesVenta] = useState<{ id: string; nombre: string }[]>([]);
  useEffect(() => {
    if (!clienteCtaCte) return;
    let vivo = true;
    clienteCtaCte
      .listar(false)
      .then((cs) => vivo && setClientesVenta(cs.map((c) => ({ id: c.id, nombre: c.nombre }))))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [clienteCtaCte]);

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
  const puedeGestion = normalizarRol(usuario.rol) !== "CAJERO";
  const esAdmin = normalizarRol(usuario.rol) === "ADMIN";

  // Asistente de IA: los datos exactos (ventas/stock/vencimientos/deudores) los
  // responde siempre el mock local; todo lo demás (funciones del sistema, dudas
  // fiscales, charla libre) se deriva al LLM real (Gemini vía el servidor) si
  // está disponible.
  const asistenteMock = useMemo(
    () => new AsistenteIAMock({ reportes: clienteReportes, stock: clienteStock, ctacte: clienteCtaCte }),
    [clienteReportes, clienteStock, clienteCtaCte],
  );
  const asistente = useMemo(
    () => new AsistenteIACompuesto(asistenteMock, clienteIA),
    [asistenteMock, clienteIA],
  );

  return (
    <div className="app-shell">
      <aside className={`sidebar${navAbierto ? " sidebar--open" : ""}`}>
        <div className="sidebar__brand">
          {entorno.config.logoDataUrl !== undefined ? (
            <div className="logo">
              <img src={entorno.config.logoDataUrl} alt="Logo" className="logo__img" />
              <div className="logo__text">
                <span className="logo__name">{entorno.config.razonSocial}</span>
              </div>
            </div>
          ) : (
            <div className="logo">
              <div className="logo__mark">NS</div>
              <div className="logo__text">
                <span className="logo__name">
                  NEXO<b>SOFT</b>
                </span>
                <span className="logo__tag">Conectamos tu negocio</span>
              </div>
            </div>
          )}
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
              title={tituloCerrarSesion}
              aria-label={tituloCerrarSesion}
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
          {activo?.id === "inicio" ? (
            <Inicio
              nombreComercio={entorno.config.razonSocial}
              rolPuedeGestion={puedeGestion}
              onNavegar={navegar}
              {...(clienteReportes ? { clienteReportes } : {})}
              {...(clienteStock ? { clienteStock } : {})}
              {...(clienteCtaCte ? { clienteCtaCte } : {})}
            />
          ) : activo?.id === "ia" ? (
            <PantallaAsistenteIA
              cliente={asistente}
              puedeConfigurar={esAdmin}
              {...(clienteAsistenteConfig ? { clienteConfig: clienteAsistenteConfig } : {})}
            />
          ) : activo?.id === "pos" ? (
            <PantallaPos
              entorno={entorno}
              sync={sync}
              clientes={clientesVenta}
              {...(clienteMediosPago ? { clienteMediosPago } : {})}
            />
          ) : activo?.id === "catalogo" && clienteCatalogo ? (
            <CatalogoAbm cliente={clienteCatalogo} />
          ) : activo?.id === "etiquetas" && clienteCatalogo ? (
            <EtiquetasGondola cliente={clienteCatalogo} lector={entorno.lector} />
          ) : activo?.id === "stock" && clienteStock ? (
            <StockAbm cliente={clienteStock} />
          ) : activo?.id === "caja" && clienteCaja && terminalId ? (
            <CajaPanel cliente={clienteCaja} terminalId={terminalId} />
          ) : activo?.id === "ctacte" && clienteCtaCte ? (
            <CuentasCorrientes cliente={clienteCtaCte} />
          ) : activo?.id === "proveedores" && clienteProveedores ? (
            <Proveedores cliente={clienteProveedores} />
          ) : activo?.id === "medios-pago" && clienteMediosPago ? (
            <MediosDePago cliente={clienteMediosPago} />
          ) : activo?.id === "comprobantes" && clienteVentas ? (
            <Comprobantes cliente={clienteVentas} config={entorno.config} />
          ) : activo?.id === "reportes" && clienteReportes ? (
            <ReportesPos cliente={clienteReportes} />
          ) : activo?.id === "presupuestos" && clientePresupuestos ? (
            <Presupuestos cliente={clientePresupuestos} catalogo={catalogoPresup} />
          ) : activo?.id === "remitos" && clienteRemitos ? (
            <Remitos cliente={clienteRemitos} catalogo={catalogoPresup} />
          ) : activo?.id === "usuarios" && clienteUsuarios ? (
            <PantallaUsuarios cliente={clienteUsuarios} {...(usuario.id ? { propioId: usuario.id } : {})} />
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
