import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ProveedorSesion } from "./auth/contexto-sesion";
import { PantallaLogin } from "./componentes/PantallaLogin";
import { RutaProtegida } from "./componentes/RutaProtegida";
import { Layout } from "./componentes/Layout";
import { Resumen } from "./paginas/Resumen";
import { Ventas } from "./paginas/Ventas";
import { Placeholder } from "./paginas/Placeholder";

export function App() {
  return (
    <ProveedorSesion>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PantallaLogin />} />
          <Route
            element={
              <RutaProtegida>
                <Layout />
              </RutaProtegida>
            }
          >
            <Route index element={<Resumen />} />
            <Route path="ventas" element={<Ventas />} />
            <Route
              path="productos"
              element={<Placeholder titulo="Productos" fase="Fase 6.4" />}
            />
            <Route path="stock" element={<Placeholder titulo="Stock" fase="Fase 6.4" />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ProveedorSesion>
  );
}
