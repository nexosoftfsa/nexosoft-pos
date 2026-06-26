import { useMemo } from "react";

import { PantallaPos } from "./componentes/PantallaPos";
import { crearEntornoPos } from "./datos/bootstrap";

export function App() {
  // En desarrollo el entorno usa datos en memoria; en Tauri usará SQLite.
  const entorno = useMemo(() => crearEntornoPos(), []);
  return <PantallaPos entorno={entorno} />;
}
