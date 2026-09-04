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
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import {
  instalarYReiniciar,
  leerEstadoActualizacion,
  suscribirseActualizacion,
} from "../datos/actualizaciones";
import { ETIQUETA_PLAN, Plan, type EstadoLicencia } from "@nexosoft/licencias";
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
import { useEsperandoCae } from "../sync/useEsperandoCae";
import { useSync } from "../sync/useSync";
import { PantallaPos } from "../componentes/PantallaPos";
import { BannerSuscripcion, PantallaSuscripcionBloqueada } from "../componentes/AvisoSuscripcion";
import { PantallaFueraDePlan } from "../componentes/FueraDePlan";
import { PantallaCajaCerrada } from "../componentes/AvisoCajaCerrada";
import { puedeVenderConCaja, type EstadoCaja } from "../componentes/caja-helpers";
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
import type { ClienteCredenciales } from "../sync/cliente-credenciales-http";
import { IconoMenu, IconoPin, IconoSalir } from "./iconos";
import { Placeholder } from "./Placeholder";
import {
  buscarModulo,
  ETIQUETA_ROL,
  moduloEnPlan,
  moduloInicial,
  modulosVisibles,
  normalizarRol,
  planDelModulo,
  SECCIONES,
  type DefinicionModulo,
} from "./modulos";

export interface UsuarioShell {
  readonly id?: string;
  readonly email?: string;
  readonly rol?: string;
}

/** Fase 17: clave de `localStorage` (por dispositivo) para el pin del menú. */
const CLAVE_SIDEBAR_FIJADO = "nexosoft.sidebarFijado";

function iniciales(email: string | undefined): string {
  if (!email) return "NS";
  const local = email.split("@")[0] ?? email;
  const partes = local.split(/[.\-_]/).filter(Boolean);
  const dos = partes.length >= 2 ? partes[0]![0]! + partes[1]![0]! : local.slice(0, 2);
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
  clienteCredenciales,
  terminalId,
  terminalNombre,
  onCerrarSesion,
  tituloCerrarSesion = "Cerrar sesión",
  onAbrirConfig,
  suscripcion,
}: {
  entorno: EntornoPos;
  usuario: UsuarioShell;
  /**
   * Estado de la suscripción (ADR-0056). Si no se pasa, el sistema opera
   * normal — una instalación sin suscripción configurada no se controla.
   */
  suscripcion?: EstadoLicencia;
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
  /** Credencial de acceso por código de barras (Fase 15.A). Solo ADMIN, solo Tauri conectado. */
  clienteCredenciales?: ClienteCredenciales;
  /** Id de la terminal (para la caja). */
  terminalId?: string;
  terminalNombre?: string;
  onCerrarSesion?: () => void;
  /** Texto del botón/tooltip de `onCerrarSesion` (p.ej. "Salir del modo demo"). */
  tituloCerrarSesion?: string;
  onAbrirConfig?: () => void;
}) {
  const sync = useSync(entorno.sync);
  // Los comprobantes que esperan el CAE son un problema aparte del de la cola:
  // pueden estar todos subidos y ARCA no contestar. Ver `IndicadorSync`.
  const esperandoCae = useEsperandoCae(clienteVentas ?? null);
  const estadoActualizacion = useSyncExternalStore(
    suscribirseActualizacion,
    leerEstadoActualizacion,
  );
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

  // Fase 17: menú lateral rebatible — colapsado por defecto, se expande al
  // pasar el mouse (como overlay, sin correr el contenido) o queda fijo si
  // el cajero lo bloquea con el pin. El fijado se guarda por dispositivo.
  const [sidebarFijado, setSidebarFijado] = useState<boolean>(
    () => localStorage.getItem(CLAVE_SIDEBAR_FIJADO) === "1",
  );
  const [sidebarHover, setSidebarHover] = useState(false);
  const sidebarExpandido = sidebarFijado || sidebarHover;

  function alternarSidebarFijado() {
    setSidebarFijado((prev) => {
      const nuevo = !prev;
      localStorage.setItem(CLAVE_SIDEBAR_FIJADO, nuevo ? "1" : "0");
      return nuevo;
    });
  }

  // Estado de la caja (Fase 17.F): sin turno abierto no se vende.
  //
  // Se refresca al entrar a Ventas y al volver de Caja, que son los dos
  // momentos en los que puede haber cambiado. No hace falta un intervalo: el
  // turno lo abre y lo cierra esta misma terminal.
  const [estadoCaja, setEstadoCaja] = useState<EstadoCaja>("desconocida");
  useEffect(() => {
    if (!clienteCaja || terminalId === undefined) return;
    let vivo = true;
    clienteCaja
      .turnoActual(terminalId)
      .then((t) => vivo && setEstadoCaja(t === null ? "cerrada" : "abierta"))
      // Sin respuesta del servidor NO se bloquea: vender no depende de la red
      // (ADR-0004). Ver `puedeVenderConCaja`.
      .catch(() => vivo && setEstadoCaja("desconocida"));
    return () => {
      vivo = false;
    };
  }, [clienteCaja, terminalId, activoId]);

  // Clientes para vender en cuenta corriente (fiado) desde la pantalla de ventas.
  // Se pasan los datos fiscales completos —documento, condición IVA, domicilio—
  // porque los necesita PantallaPos al armar el bloque del receptor en una
  // Factura A o B. Antes se descartaban al mapear y sólo se guardaban id +
  // nombre; sin esos datos una A no se puede identificar en el papel.
  const [clientesVenta, setClientesVenta] = useState<
    { id: string; nombre: string; documento: string | null; condicionIva: string; direccion: string | null }[]
  >([]);
  useEffect(() => {
    if (!clienteCtaCte) return;
    let vivo = true;
    clienteCtaCte
      .listar(false)
      .then(
        (cs) =>
          vivo &&
          setClientesVenta(
            cs.map((c) => ({
              id: c.id,
              nombre: c.nombre,
              documento: c.documento,
              condicionIva: c.condicionIva,
              direccion: c.direccion,
            })),
          ),
      )
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [clienteCtaCte]);

  const activo = visibles.find((m) => m.id === activoId) ?? visibles[0];

  // Plan contratado (ADR-0067). Sin suscripción configurada están todos los
  // módulos: una instalación que no controlamos no se gatea.
  const plan = suscripcion?.plan ?? Plan.Premium;
  const activoEnPlan = activo === undefined || moduloEnPlan(activo, plan);

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
    () =>
      new AsistenteIAMock({
        reportes: clienteReportes,
        stock: clienteStock,
        ctacte: clienteCtaCte,
      }),
    [clienteReportes, clienteStock, clienteCtaCte],
  );
  const asistente = useMemo(
    () => new AsistenteIACompuesto(asistenteMock, clienteIA),
    [asistenteMock, clienteIA],
  );

  return (
    <div className={`app-shell${sidebarFijado ? " app-shell--sidebar-fijado" : ""}`}>
      <aside
        className={`sidebar${navAbierto ? " sidebar--open" : ""}${
          sidebarExpandido ? " sidebar--expandido" : " sidebar--colapsado"
        }${sidebarFijado ? " sidebar--fijado" : ""}`}
        onMouseEnter={() => setSidebarHover(true)}
        onMouseLeave={() => setSidebarHover(false)}
      >
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
          <button
            type="button"
            className={`sidebar__pin${sidebarFijado ? " sidebar__pin--activo" : ""}`}
            onClick={alternarSidebarFijado}
            title={sidebarFijado ? "Desbloquear menú" : "Fijar menú abierto"}
            aria-label={sidebarFijado ? "Desbloquear menú" : "Fijar menú abierto"}
            aria-pressed={sidebarFijado}
          >
            <IconoPin />
          </button>
        </div>

        <nav className="nav">
          {SECCIONES.map((seccion) => {
            const items = visibles.filter((m) => m.seccion === seccion);
            if (items.length === 0) return null;
            return (
              <div key={seccion}>
                <div className="nav__sec">{seccion}</div>
                {items.map((m) => (
                  <ItemNav
                    key={m.id}
                    modulo={m}
                    activo={m.id === activo?.id}
                    enPlan={moduloEnPlan(m, plan)}
                    planNecesario={planDelModulo(m)}
                    onClick={() => navegar(m.id)}
                  />
                ))}
              </div>
            );
          })}
        </nav>

        {estadoActualizacion.fase === "lista" && (
          <button
            type="button"
            className="actualizacion-lista"
            onClick={() => void instalarYReiniciar()}
            title={`Versión ${estadoActualizacion.info.versionDisponible} lista para instalar`}
          >
            Reiniciar para actualizar
          </button>
        )}

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

      {navAbierto && (
        <div className="nav-backdrop nav-backdrop--show" onClick={() => setNavAbierto(false)} />
      )}

      <div className="shell-main">
        {/* Recordatorio y advertencia: franja arriba de todo, en cualquier módulo. */}
        {suscripcion !== undefined && <BannerSuscripcion estado={suscripcion} />}
        <header className="topbar">
          <button
            type="button"
            className="hamburger"
            onClick={() => setNavAbierto(true)}
            aria-label="Menú"
          >
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
            <IndicadorSync estado={sync} esperandoCae={esperandoCae} />
            {terminalNombre !== undefined && (
              <span className="chip chip--muted" title="Terminal">
                {terminalNombre}
              </span>
            )}
          </div>
        </header>

        <div className="shell-content">
          {/* Fuera del plan: se muestra la oferta, no un error. Va antes que
              todo lo demás para que ningún módulo se cargue a medias. */}
          {activo !== undefined && !activoEnPlan ? (
            <PantallaFueraDePlan
              titulo={activo.titulo}
              descripcion={activo.crumb}
              planNecesario={planDelModulo(activo)}
              planActual={plan}
            />
          ) : activo?.id === "inicio" ? (
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
            // Fase 17.B (ADR-0056): con la suscripción cortada se bloquea
            // VENDER, no el sistema entero. Caja y los reportes siguen acá al
            // lado, para cerrar el turno abierto y consultar lo histórico.
            suscripcion !== undefined && !suscripcion.puedeVender ? (
              <PantallaSuscripcionBloqueada
                estado={suscripcion}
                onCerrarCaja={() => navegar("caja")}
              />
            ) : !puedeVenderConCaja(estadoCaja) ? (
              <PantallaCajaCerrada onAbrirCaja={() => navegar("caja")} />
            ) : (
              <PantallaPos
                entorno={entorno}
                sync={sync}
                clientes={clientesVenta}
                {...(clienteMediosPago ? { clienteMediosPago } : {})}
              />
            )
          ) : activo?.id === "catalogo" && clienteCatalogo ? (
            <CatalogoAbm cliente={clienteCatalogo} />
          ) : activo?.id === "etiquetas" && clienteCatalogo ? (
            <EtiquetasGondola cliente={clienteCatalogo} lector={entorno.lector} />
          ) : activo?.id === "stock" && clienteStock ? (
            <StockAbm cliente={clienteStock} />
          ) : activo?.id === "caja" && clienteCaja && terminalId ? (
            <CajaPanel
              cliente={clienteCaja}
              terminalId={terminalId}
              ventasSinSincronizar={sync.pendientes}
            />
          ) : activo?.id === "ctacte" && clienteCtaCte ? (
            <CuentasCorrientes cliente={clienteCtaCte} />
          ) : activo?.id === "proveedores" && clienteProveedores ? (
            <Proveedores cliente={clienteProveedores} />
          ) : activo?.id === "medios-pago" && clienteMediosPago ? (
            <MediosDePago cliente={clienteMediosPago} />
          ) : activo?.id === "comprobantes" && clienteVentas ? (
            <Comprobantes
              cliente={clienteVentas}
              config={entorno.config}
              {...(entorno.sync.ventasLocales !== undefined
                ? { ventasLocales: entorno.sync.ventasLocales }
                : {})}
            />
          ) : activo?.id === "reportes" && clienteReportes ? (
            <ReportesPos cliente={clienteReportes} />
          ) : activo?.id === "presupuestos" && clientePresupuestos ? (
            <Presupuestos cliente={clientePresupuestos} catalogo={catalogoPresup} />
          ) : activo?.id === "remitos" && clienteRemitos ? (
            <Remitos cliente={clienteRemitos} catalogo={catalogoPresup} />
          ) : activo?.id === "usuarios" && clienteUsuarios ? (
            <PantallaUsuarios
              cliente={clienteUsuarios}
              {...(clienteCredenciales ? { clienteCredenciales } : {})}
              {...(usuario.id ? { propioId: usuario.id } : {})}
              comercio={{
                razonSocial: entorno.config.razonSocial,
                ...(entorno.config.logoDataUrl !== undefined
                  ? { logoDataUrl: entorno.config.logoDataUrl }
                  : {}),
              }}
            />
          ) : activo ? (
            <Placeholder
              modulo={activo}
              {...(activo.id === "config" && onAbrirConfig === undefined
                ? {
                    motivo:
                      "El modo demo no usa servidor de sucursal, así que no hay nada que configurar acá. En el sistema instalado, esta pantalla tiene los datos del comercio, el punto de venta, el acceso remoto y las actualizaciones.",
                  }
                : {})}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ItemNav({
  modulo,
  activo,
  enPlan,
  planNecesario,
  onClick,
}: {
  modulo: DefinicionModulo;
  activo: boolean;
  /** `false` cuando el módulo no entra en el plan: se ve, con candado. */
  enPlan: boolean;
  planNecesario: Plan;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`nav-item${activo ? " nav-item--active" : ""}`}
      onClick={onClick}
      // No se deshabilita: el módulo tiene que poder abrirse para contar qué
      // hace y en qué plan está (ADR-0067 §4).
      style={enPlan ? undefined : { opacity: 0.55 }}
      title={enPlan ? undefined : `Disponible en el plan ${ETIQUETA_PLAN[planNecesario]}`}
    >
      {modulo.icono()}
      <span className="nav-item__label">{modulo.titulo}</span>
      {!enPlan && (
        <span className="badge" aria-label={`Disponible en ${ETIQUETA_PLAN[planNecesario]}`}>
          🔒 {ETIQUETA_PLAN[planNecesario]}
        </span>
      )}
      {enPlan && modulo.badge !== undefined && (
        <span className="badge badge--info">{modulo.badge}</span>
      )}
    </button>
  );
}
