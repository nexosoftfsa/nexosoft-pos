import { NavLink, Outlet } from "react-router-dom";
import { useSesion } from "../auth/contexto-sesion";

const SECCIONES = [
  { ruta: "/", etiqueta: "Resumen", fin: true },
  { ruta: "/ventas", etiqueta: "Ventas", fin: false },
  { ruta: "/productos", etiqueta: "Productos", fin: false },
  { ruta: "/stock", etiqueta: "Stock", fin: false },
] as const;

/** Shell del panel: barra lateral de navegación + header con usuario y logout. */
export function Layout() {
  const { sesion, logout } = useSesion();

  return (
    <div className="layout">
      <aside className="layout__nav">
        <div className="layout__marca">NexoSoft</div>
        <nav>
          {SECCIONES.map((s) => (
            <NavLink
              key={s.ruta}
              to={s.ruta}
              end={s.fin}
              className={({ isActive }) =>
                `layout__link${isActive ? " layout__link--activo" : ""}`
              }
            >
              {s.etiqueta}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="layout__principal">
        <header className="layout__header">
          <span className="layout__titulo">Panel de reportes</span>
          <div className="layout__usuario">
            <span>
              {sesion?.email} · <strong>{sesion?.rol}</strong>
            </span>
            <button className="boton boton--secundario" onClick={logout}>
              Salir
            </button>
          </div>
        </header>
        <main className="layout__contenido">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
