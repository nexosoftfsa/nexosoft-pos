import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ProveedorSesion } from "./auth/contexto-sesion";
import { PantallaLogin } from "./componentes/PantallaLogin";
import { RutaProtegida } from "./componentes/RutaProtegida";
import { Layout } from "./componentes/Layout";
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
            <Route index element={<Placeholder titulo="Resumen" fase="Fase 6.3" />} />
            <Route path="ventas" element={<Placeholder titulo="Ventas" fase="Fase 6.3" />} />
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
