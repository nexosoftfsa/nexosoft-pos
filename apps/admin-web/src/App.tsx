import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ProveedorSesion } from "./auth/contexto-sesion";
import { PantallaLogin } from "./componentes/PantallaLogin";
import { RutaProtegida } from "./componentes/RutaProtegida";
import { Layout } from "./componentes/Layout";
import { Resumen } from "./paginas/Resumen";
import { Ventas } from "./paginas/Ventas";
import { Productos } from "./paginas/Productos";
import { Stock } from "./paginas/Stock";

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
            <Route path="productos" element={<Productos />} />
            <Route path="stock" element={<Stock />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ProveedorSesion>
  );
}
