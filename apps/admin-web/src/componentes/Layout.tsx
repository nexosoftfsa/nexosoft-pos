import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useSesion } from "../auth/contexto-sesion";
import { obtenerLogo } from "../api/comercio";

const SECCIONES = [
  { ruta: "/", etiqueta: "Resumen", fin: true },
  { ruta: "/ventas", etiqueta: "Ventas", fin: false },
  { ruta: "/productos", etiqueta: "Productos", fin: false },
  { ruta: "/stock", etiqueta: "Stock", fin: false },
] as const;

/**
 * Shell del panel: barra lateral de navegación + header con usuario y logout.
 * En mobile (Fase 15.B) la barra lateral se convierte en un drawer off-canvas,
 * abierto con el botón hamburguesa del header y cerrado al navegar o tocar
 * el fondo oscurecido.
 */
export function Layout() {
  const { sesion, api, logout } = useSesion();
  const [logo, setLogo] = useState<string | null>(null);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const location = useLocation();

  useEffect(() => {
    let vivo = true;
    obtenerLogo(api)
      .then((r) => vivo && setLogo(r.logoBase64))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [api]);

  useEffect(() => {
    setMenuAbierto(false);
  }, [location.pathname]);

  return (
    <div className="layout">
      {menuAbierto && (
        <div className="layout__overlay" onClick={() => setMenuAbierto(false)} aria-hidden="true" />
      )}
      <aside className={`layout__nav${menuAbierto ? " layout__nav--abierto" : ""}`}>
        <div className="layout__marca">
          {logo !== null ? <img src={logo} alt="Logo" className="layout__logo" /> : "NexoSoft"}
        </div>
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
          <button
            type="button"
            className="layout__burger"
            onClick={() => setMenuAbierto((v) => !v)}
            aria-label="Abrir menú"
            aria-expanded={menuAbierto}
          >
            ☰
          </button>
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
